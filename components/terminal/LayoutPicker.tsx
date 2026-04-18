'use client';

import { useTerminalStore, type TerminalLayout } from '@/stores/terminal-slice';
import { cn } from '@/lib/utils';

interface Option {
  key: TerminalLayout;
  label: string;
  aria: string;
}

const OPTIONS: ReadonlyArray<Option> = [
  { key: 'single', label: '1', aria: 'Single pane' },
  { key: 'h', label: '1x2', aria: 'Horizontal split' },
  { key: 'v', label: '2x1', aria: 'Vertical split' },
  { key: 'quad', label: '2x2', aria: 'Quad split' },
];

export function LayoutPicker() {
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const tab = useTerminalStore((s) =>
    s.activeTabId ? (s.tabs.find((t) => t.id === s.activeTabId) ?? null) : null,
  );
  const setLayout = useTerminalStore((s) => s.setLayout);
  if (!activeTabId || !tab) return null;
  return (
    <div
      role="group"
      aria-label="Pane layout"
      className="inline-flex items-center gap-0.5 rounded border border-[var(--line)] p-0.5"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          aria-label={opt.aria}
          aria-pressed={tab.layout === opt.key}
          title={opt.aria}
          className={cn(
            'font-mono rounded px-1.5 py-0.5 text-xs transition-colors',
            tab.layout === opt.key
              ? 'bg-[var(--gold-700)] text-black'
              : 'text-[color:var(--fg-3)] hover:bg-[var(--line)]',
          )}
          onClick={() => setLayout(activeTabId, opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
