'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePty, type PtyStatus } from '@/hooks/use-pty';
import { useSettings } from '@/hooks/use-settings';
import { toastInfo } from '@/lib/ui/toast';

export interface TerminalProps {
  cwd: string;
  /** Optional shell override. */
  shell?: string;
  /** Optional args (e.g. ['--resume', sessionId] for claude). */
  args?: string[];
  /** Command typed into PTY stdin after it becomes ready. */
  initCommand?: string;
}

const RESIZE_DEBOUNCE_MS = 100;

export function Terminal({ cwd, shell, args, initCommand }: TerminalProps) {
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
    toastInfo('Zapisano bufor terminala', { description: a.download });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
        <span className="font-mono">{cwd}</span>
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
          <Button size="sm" variant="ghost" onClick={handleClear} title="Wyczyść bufor">
            Wyczyść
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSave} title="Pobierz bufor jako .txt">
            Zapisz
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
