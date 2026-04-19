'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ACK_CHUNK = 64 * 1024;

export interface PtyEvents {
  onData?: (chunk: string) => void;
  onExit?: (info: { exitCode: number; signal?: number }) => void;
  onStatus?: (status: PtyStatus) => void;
  onError?: (code: string) => void;
}

export type PtyStatus = 'connecting' | 'ready' | 'closed' | 'error';

export interface SpawnConfig {
  cwd: string;
  cols: number;
  rows: number;
  shell?: string;
  args?: string[];
  /** If set, attach to an existing persistent PTY instead of spawning. */
  persistentId?: string;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Opens a WebSocket to /api/ws/pty, spawns (or attaches to) the session,
 * pumps input/output. Client ACKs every ACK_CHUNK bytes to release
 * server-side backpressure.
 */
export function usePty(events: PtyEvents) {
  const [status, setStatus] = useState<PtyStatus>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const receivedRef = useRef(0);
  const spawnedRef = useRef(false);
  const persistentRef = useRef(false);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  const setAndEmit = useCallback((s: PtyStatus) => {
    setStatus(s);
    eventsRef.current.onStatus?.(s);
  }, []);

  const connect = useCallback(
    (cfg: SpawnConfig) => {
      if (wsRef.current) return;
      const csrf = readCookie('codehelm_csrf') ?? '';
      setAndEmit('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/pty`);
      wsRef.current = ws;
      persistentRef.current = Boolean(cfg.persistentId);

      ws.onopen = () => {
        if (cfg.persistentId) {
          const attach: Record<string, unknown> = {
            type: 'attach',
            csrf,
            persistentId: cfg.persistentId,
            cols: cfg.cols,
            rows: cfg.rows,
          };
          ws.send(JSON.stringify(attach));
        } else {
          const spawn: Record<string, unknown> = {
            type: 'spawn',
            csrf,
            cwd: cfg.cwd,
            cols: cfg.cols,
            rows: cfg.rows,
          };
          if (cfg.shell) spawn['shell'] = cfg.shell;
          if (cfg.args) spawn['args'] = cfg.args;
          ws.send(JSON.stringify(spawn));
        }
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        } catch {
          return;
        }
        if (msg['type'] === 'spawned' || msg['type'] === 'attached') {
          spawnedRef.current = true;
          if (msg['type'] === 'attached' && typeof msg['tail'] === 'string' && msg['tail']) {
            eventsRef.current.onData?.(msg['tail'] as string);
          }
          setAndEmit('ready');
        } else if (msg['type'] === 'data') {
          const chunk = String(msg['data'] ?? '');
          receivedRef.current += chunk.length;
          eventsRef.current.onData?.(chunk);
          if (receivedRef.current >= ACK_CHUNK) {
            ws.send(JSON.stringify({ type: 'ack', bytes: receivedRef.current }));
            receivedRef.current = 0;
          }
        } else if (msg['type'] === 'exit') {
          const exitCode = typeof msg['exitCode'] === 'number' ? (msg['exitCode'] as number) : 0;
          const sig = typeof msg['signal'] === 'number' ? (msg['signal'] as number) : undefined;
          eventsRef.current.onExit?.({ exitCode, ...(sig !== undefined ? { signal: sig } : {}) });
        } else if (msg['type'] === 'error') {
          const code = typeof msg['code'] === 'string' ? msg['code'] : 'unknown';
          // Log to console so devtools show why we failed without having to
          // sniff raw WS frames. Also forwards to onError for UI surfacing.
          console.warn(`[pty] server error: ${code}`);
          eventsRef.current.onError?.(code);
          setAndEmit('error');
        }
      };

      ws.onclose = () => {
        // Guard against the close-then-reconnect race: if `close()` already
        // ran and a new ws was opened, `wsRef.current` points at the new
        // socket — we must not null it from this stale handler, otherwise
        // `write()`/`resize()` silently drop everything until the next mount.
        if (wsRef.current === ws) {
          wsRef.current = null;
          spawnedRef.current = false;
          setAndEmit('closed');
        }
      };

      ws.onerror = () => {
        if (wsRef.current === ws) setAndEmit('error');
      };
    },
    [setAndEmit],
  );

  const write = useCallback((data: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !spawnedRef.current) return;
    ws.send(JSON.stringify({ type: 'data', data }));
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !spawnedRef.current) return;
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  }, []);

  const close = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    // Detach handlers FIRST so any in-flight 'data'/'attached'/'exit' frames,
    // and especially the eventual 'close' event, cannot fire and corrupt
    // state for a follow-up connect(). Without this, a fast close→connect
    // (the RESTART button) lets the OLD ws.onclose null `wsRef.current`
    // AFTER the new ws has been assigned — leaving the new socket orphaned
    // (write/resize silently drop everything) while a second restart spawns
    // yet another socket that double-subscribes to the same persistent PTY,
    // which is what shows up as duplicated output and a "frozen" tab.
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      if (persistentRef.current) {
        ws.send(JSON.stringify({ type: 'detach' }));
      } else {
        ws.send(JSON.stringify({ type: 'kill' }));
      }
    } catch {
      /* ignore */
    }
    try {
      ws.close(1000);
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    spawnedRef.current = false;
    persistentRef.current = false;
    receivedRef.current = 0;
    setAndEmit('closed');
  }, [setAndEmit]);

  useEffect(() => {
    return () => close();
  }, [close]);

  return { status, connect, write, resize, close };
}
