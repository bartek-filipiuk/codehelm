'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePty, type PtyStatus } from '@/hooks/use-pty';
import { useSettings } from '@/hooks/use-settings';
import { useTerminalStore } from '@/stores/terminal-slice';
import { toastInfo } from '@/lib/ui/toast';

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
  tabId?: string;
}

const RESIZE_DEBOUNCE_MS = 100;

export function Terminal({ cwd, shell, args, initCommand, tabId }: TerminalProps) {
  const registerWriter = useTerminalStore((s) => s.registerWriter);
  const unregisterWriter = useTerminalStore((s) => s.unregisterWriter);
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
  const { connect, write, resize, close } = usePty({
    onData: (chunk) => termRef.current?.write(chunk),
    onExit: ({ exitCode }) => {
      termRef.current?.write(`\r\n\x1b[33m[exit ${exitCode}]\x1b[0m\r\n`);
    },
    onStatus: (s) => {
      setStatus(s);
      // Type the init command once, the first time the PTY is ready.
      if (s === 'ready' && initCommand && !initSentRef.current) {
        initSentRef.current = true;
        // Small delay so the shell's prompt renders before typing.
        setTimeout(() => write(`${initCommand}\r`), 80);
      }
    },
  });

  // Publish our write function to the store so quick actions can reach us.
  useEffect(() => {
    if (!tabId) return;
    registerWriter(tabId, write);
    return () => unregisterWriter(tabId);
  }, [tabId, write, registerWriter, unregisterWriter]);

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
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      term.onData((data) => write(data));
      term.onResize(({ cols, rows }) => {
        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = setTimeout(() => resize(cols, rows), RESIZE_DEBOUNCE_MS);
      });
      termRef.current = term;
      fitRef.current = fit;

      const cols = term.cols;
      const rows = term.rows;
      connect({
        cwd,
        cols,
        rows,
        ...(shell ? { shell } : {}),
        ...(args ? { args } : {}),
      });
    })();
    return () => {
      disposed = true;
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono">{cwd}</span>
          {gitStatus?.branch && (
            <button
              type="button"
              onClick={() => void fetchGitStatus()}
              className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
              title={gitStatus.dirty ? `${gitStatus.branch} (dirty)` : gitStatus.branch}
            >
              <span>{gitStatus.branch}</span>
              {gitStatus.dirty && <span className="text-amber-400">●</span>}
            </button>
          )}
        </span>
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
          <Button size="sm" variant="ghost" onClick={handleClear} title="Clear buffer">
            Clear
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSave} title="Download buffer as .txt">
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              close();
              // Mini-reset: re-connect with same config.
              const cols = termRef.current?.cols ?? 80;
              const rows = termRef.current?.rows ?? 24;
              connect({
                cwd,
                cols,
                rows,
                ...(shell ? { shell } : {}),
                ...(args ? { args } : {}),
              });
            }}
          >
            Restart
          </Button>
        </span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1" />
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
  const colors: Record<PtyStatus, string> = {
    connecting: 'bg-amber-900/60 text-amber-200',
    ready: 'bg-emerald-900/60 text-emerald-200',
    closed: 'bg-neutral-800 text-neutral-400',
    error: 'bg-red-900/60 text-red-200',
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${colors[status]}`}>{status}</span>;
}
