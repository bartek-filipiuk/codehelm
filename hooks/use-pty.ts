'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ACK_CHUNK = 64 * 1024;

export interface PtyEvents {
  onData?: (chunk: string) => void;
  onExit?: (info: { exitCode: number; signal?: number }) => void;
  onStatus?: (status: PtyStatus) => void;
}

export type PtyStatus = 'connecting' | 'ready' | 'closed' | 'error';

export interface SpawnConfig {
  cwd: string;
  cols: number;
  rows: number;
  shell?: string;
  args?: string[];
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Opens a WebSocket to /api/ws/pty, spawns the session, pumps input/output.
 * Client ACKs every ACK_CHUNK bytes to release server-side backpressure.
 */
export function usePty(events: PtyEvents) {
  const [status, setStatus] = useState<PtyStatus>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const receivedRef = useRef(0);
  const spawnedRef = useRef(false);
  // Stable refs for event handlers. Updated in an effect so we don't write
  // during render (react-hooks plugin forbids it).
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
      const csrf = readCookie('claude_ui_csrf') ?? '';
      setAndEmit('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/pty`);
      wsRef.current = ws;

      ws.onopen = () => {
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
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        } catch {
          return;
        }
        if (msg['type'] === 'spawned') {
          spawnedRef.current = true;
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
          setAndEmit('error');
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        spawnedRef.current = false;
        setAndEmit('closed');
      };

      ws.onerror = () => {
        setAndEmit('error');
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
    try {
      ws.send(JSON.stringify({ type: 'kill' }));
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
  }, []);

  useEffect(() => {
    return () => close();
  }, [close]);

  return { status, connect, write, resize, close };
}
