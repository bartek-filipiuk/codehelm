'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePty, type PtyStatus } from '@/hooks/use-pty';

export interface TerminalProps {
  cwd: string;
  /** Optional shell override. */
  shell?: string;
  /** Optional args (e.g. ['--resume', sessionId] for claude). */
  args?: string[];
}

const RESIZE_DEBOUNCE_MS = 100;

export function Terminal({ cwd, shell, args }: TerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<PtyStatus>('closed');
  const { connect, write, resize, close } = usePty({
    onData: (chunk) => termRef.current?.write(chunk),
    onExit: ({ exitCode }) => {
      termRef.current?.write(`\r\n\x1b[33m[exit ${exitCode}]\x1b[0m\r\n`);
    },
    onStatus: setStatus,
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
        fontSize: 13,
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
        <span className="font-mono">{cwd}</span>
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
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

function StatusBadge({ status }: { status: PtyStatus }) {
  const colors: Record<PtyStatus, string> = {
    connecting: 'bg-amber-900/60 text-amber-200',
    ready: 'bg-emerald-900/60 text-emerald-200',
    closed: 'bg-neutral-800 text-neutral-400',
    error: 'bg-red-900/60 text-red-200',
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${colors[status]}`}>{status}</span>;
}
