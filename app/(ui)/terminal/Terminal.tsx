'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHButton } from '@/components/ui/ch-button';
import { Badge } from '@/components/ui/badge';
import { usePty, type PtyStatus } from '@/hooks/use-pty';
import { useSettings } from '@/hooks/use-settings';
import { useTerminalStore } from '@/stores/terminal-slice';
import { toastInfo } from '@/lib/ui/toast';
import { registerPersistentTab } from '@/lib/ui/persistent-tab-sync';

export interface TerminalProps {
  cwd: string;
  /** Optional shell override. */
  shell?: string;
  /** Optional args (e.g. ['--resume', sessionId] for claude). */
  args?: string[];
  /** Command typed into PTY stdin after it becomes ready. */
  initCommand?: string;
  /**
   * When set, the terminal registers its write function in the terminal
   * store keyed by this id. External consumers (quick actions) can then
   * `sendToActive` without prop-drilling.
   */
  paneId?: string;
  /**
   * Attach to an existing persistent PTY instead of spawning one. The PTY
   * survives tab close and browser reload; cron jobs can write to it.
   */
  persistentId?: string;
  /** Owning tab id — used to upgrade the pane to persistent on mount. */
  tabId?: string;
  /** Tab title — stored server-side so reload restores the label. */
  title?: string;
  /** Project slug owning this tab — lets reload group tabs under projects. */
  projectSlug?: string | null;
  /** Stable alias key (e.g. `resume:<id>`) persisted for reload. */
  aliasKey?: string;
}

const RESIZE_DEBOUNCE_MS = 100;

export function Terminal({
  cwd,
  shell,
  args,
  initCommand,
  paneId,
  persistentId,
  tabId,
  title,
  projectSlug,
  aliasKey,
}: TerminalProps) {
  const registerWriter = useTerminalStore((s) => s.registerWriter);
  const unregisterWriter = useTerminalStore((s) => s.unregisterWriter);
  const setPanePersistentId = useTerminalStore((s) => s.setPanePersistentId);
  const [gitStatus, setGitStatus] = useState<{ branch: string | null; dirty: boolean } | null>(
    null,
  );

  const fetchGitStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/git/status?cwd=${encodeURIComponent(cwd)}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setGitStatus(null);
        return;
      }
      const body = (await res.json()) as { branch: string | null; dirty: boolean };
      setGitStatus(body);
    } catch {
      setGitStatus(null);
    }
  }, [cwd]);

  useEffect(() => {
    void fetchGitStatus();
  }, [fetchGitStatus]);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initSentRef = useRef(false);
  const [status, setStatus] = useState<PtyStatus>('closed');
  const { data: settings } = useSettings();
  const fontSize = settings?.terminalFontSize ?? 13;
  const attachedServerSideRef = useRef<boolean>(Boolean(persistentId));
  const { connect, write, resize, close } = usePty({
    onData: (chunk) => termRef.current?.write(chunk),
    onExit: ({ exitCode }) => {
      termRef.current?.write(`\r\n\x1b[33m[exit ${exitCode}]\x1b[0m\r\n`);
    },
    onError: (code) => {
      termRef.current?.write(`\r\n\x1b[31m[pty error: ${code}]\x1b[0m\r\n`);
    },
    onStatus: (s) => {
      setStatus(s);
      // initCommand is only typed client-side for ephemeral (non-persistent)
      // PTYs. Persistent PTYs run initCommand server-side at spawn time, so
      // re-sending here would double-type it on every attach.
      if (
        s === 'ready' &&
        initCommand &&
        !initSentRef.current &&
        !attachedServerSideRef.current
      ) {
        initSentRef.current = true;
        setTimeout(() => write(`${initCommand}\r`), 80);
      }
    },
  });

  // Publish our write function to the store so quick actions can reach us.
  useEffect(() => {
    if (!paneId) return;
    registerWriter(paneId, write);
    return () => unregisterWriter(paneId);
  }, [paneId, write, registerWriter, unregisterWriter]);

  // Mount xterm exactly once.
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    let disposed = false;
    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);
      if (disposed) return;
      const term = new XTerm({
        convertEol: false,
        cursorBlink: true,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize,
        theme: {
          background: '#0a0a0a',
          foreground: '#e5e5e5',
          cursor: '#e5e5e5',
          selectionBackground: '#374151',
        },
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      if (!hostRef.current) return;
      term.open(hostRef.current);

      // Register handlers BEFORE the first fit so the initial resize event is
      // observed. The first onResize after mount is forwarded synchronously —
      // without debounce — so the PTY's termios never lags behind xterm during
      // the first render, which is when split panes' final geometry settles
      // and mismatches would otherwise desync the shell's cursor math.
      let initialResizeSent = false;
      term.onData((data) => write(data));
      term.onResize(({ cols: c, rows: r }) => {
        if (!initialResizeSent) {
          initialResizeSent = true;
          resize(c, r);
          return;
        }
        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = setTimeout(() => resize(c, r), RESIZE_DEBOUNCE_MS);
      });

      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      termRef.current = term;
      fitRef.current = fit;

      // Second fit after the browser has committed the first layout. Split
      // panes typically receive their final flex-basis here, so this catches
      // the geometry xterm saw during term.open() as wrong and corrects it
      // before the user types anything.
      requestAnimationFrame(() => {
        if (disposed) return;
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      });

      // Upgrade the pane to a persistent PTY if it isn't one already. The PTY
      // then survives WS close (tab switch, browser reload) and dies only on
      // explicit close (X button → DELETE /api/persistent-tabs/:id).
      let effectivePersistentId = persistentId;
      if (!effectivePersistentId) {
        const reg = await registerPersistentTab({
          title: title ?? cwd,
          cwd,
          ...(shell ? { shell } : {}),
          ...(initCommand ? { initCommand } : {}),
          ...(projectSlug ? { projectSlug } : {}),
          ...(aliasKey ? { aliasKey } : {}),
        });
        if (!disposed && reg) {
          effectivePersistentId = reg.persistentId;
          attachedServerSideRef.current = true;
          if (tabId && paneId) {
            setPanePersistentId(tabId, paneId, reg.persistentId);
          }
        }
      }

      const cols = term.cols;
      const rows = term.rows;
      connect({
        cwd,
        cols,
        rows,
        ...(shell ? { shell } : {}),
        ...(args ? { args } : {}),
        ...(effectivePersistentId ? { persistentId: effectivePersistentId } : {}),
      });
    })();
    return () => {
      disposed = true;
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      // Null the fit ref before disposing the terminal so any in-flight
      // ResizeObserver / custom-event handler that reaches `fitRef.current?.fit()`
      // becomes a no-op instead of hitting a terminal whose internals are gone.
      fitRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      close();
    };
    // Only on mount: cwd/shell/args are fixed per terminal instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refit on container resize.
  useEffect(() => {
    if (!hostRef.current) return;
    const obs = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
      }, RESIZE_DEBOUNCE_MS);
    });
    obs.observe(hostRef.current);
    return () => obs.disconnect();
  }, []);

  // Refit immediately (in rAF) when a PaneGrid splitter release fires.
  // ResizeObserver catches this too, but aligning to a frame kills tearing.
  useEffect(() => {
    const onEnd = () => {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener('codehelm:pane-resize-end', onEnd);
    return () => window.removeEventListener('codehelm:pane-resize-end', onEnd);
  }, []);

  // React to font-size changes from settings without re-mounting xterm.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (term.options.fontSize === fontSize) return;
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  const handleClear = () => {
    termRef.current?.clear();
  };

  const handleSave = () => {
    const term = termRef.current;
    if (!term) return;
    const content = serializeTerminalBuffer(term);
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toastInfo('Terminal buffer saved', { description: a.download });
  };

  const segments = cwd.split('/').filter(Boolean);
  const leaf = segments[segments.length - 1] ?? cwd;
  const prefix = segments.slice(0, -1);

  return (
    <div className="term-wrap">
      <div className="term-head">
        <span className="cwd">
          {cwd.startsWith('/') ? <span className="sep">/</span> : <span className="home">~</span>}
          {prefix.map((seg, i) => (
            <span key={`${seg}-${i}`}>
              {seg}
              <span className="sep">/</span>
            </span>
          ))}
          <span className="leaf">{leaf}</span>
        </span>
        {gitStatus?.branch && (
          <button
            type="button"
            className="gitbadge"
            onClick={() => void fetchGitStatus()}
            title={gitStatus.dirty ? `${gitStatus.branch} (dirty)` : gitStatus.branch}
          >
            <span>⎇ {gitStatus.branch}</span>
            {gitStatus.dirty && <span className="dirty">●</span>}
          </button>
        )}
        <StatusBadge status={status} />
        <div className="actions">
          <CHButton size="sm" onClick={handleClear} title="Clear buffer">
            clear
          </CHButton>
          <CHButton size="sm" onClick={handleSave} title="Download buffer as .txt">
            save
          </CHButton>
          <CHButton
            size="sm"
            variant="outline"
            onClick={() => {
              close();
              const cols = termRef.current?.cols ?? 80;
              const rows = termRef.current?.rows ?? 24;
              connect({
                cwd,
                cols,
                rows,
                ...(shell ? { shell } : {}),
                ...(args ? { args } : {}),
                ...(persistentId ? { persistentId } : {}),
              });
            }}
          >
            restart
          </CHButton>
        </div>
      </div>
      <div ref={hostRef} className="term-body" style={{ padding: 0 }} />
    </div>
  );
}

function serializeTerminalBuffer(term: import('@xterm/xterm').Terminal): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  // Trim trailing empty lines.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

function StatusBadge({ status }: { status: PtyStatus }) {
  const variant =
    status === 'ready'
      ? 'emerald'
      : status === 'connecting'
        ? 'gold'
        : status === 'error'
          ? 'red'
          : 'default';
  return <Badge variant={variant}>{status}</Badge>;
}
