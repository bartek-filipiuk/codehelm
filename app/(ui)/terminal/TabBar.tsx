'use client';

import { useTerminalStore, TERMINAL_TAB_CAP } from '@/stores/terminal-slice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toastInfo } from '@/lib/ui/toast';

interface Props {
  onNewTab?: () => void;
}

export function TabBar({ onNewTab }: Props) {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeTabId);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeTab = useTerminalStore((s) => s.closeTab);

  const closeWithToast = (id: string) => {
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === id);
    closeTab(id);
    toastInfo('Zakładka zamknięta', {
      id: `tab-closed-${id}`,
      ...(tab?.title ? { description: tab.title } : {}),
    });
  };

  return (
    <div className="flex items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-2 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeWithToast(t.id);
              }
            }}
            className={cn(
              'group flex max-w-[180px] shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs',
              t.id === activeId
                ? 'border-neutral-600 bg-neutral-800 text-neutral-100'
                : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200',
            )}
          >
            <button
              type="button"
              onClick={() => setActive(t.id)}
              className="min-w-0 flex-1 truncate text-left"
              title={`${t.title} · ${t.cwd}`}
            >
              {t.title}
            </button>
            <button
              type="button"
              aria-label="Zamknij zakładkę"
              onClick={(e) => {
                e.stopPropagation();
                closeWithToast(t.id);
              }}
              className="rounded px-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {onNewTab && (
        <Button
          size="sm"
          variant="outline"
          disabled={tabs.length >= TERMINAL_TAB_CAP}
          onClick={onNewTab}
          title={tabs.length >= TERMINAL_TAB_CAP ? 'Limit 16 zakładek' : 'Nowa zakładka'}
        >
          +
        </Button>
      )}
    </div>
  );
}
