'use client';

import { useTerminalStore } from '@/stores/terminal-slice';
import { PaneGrid } from '@/components/terminal/PaneGrid';
import { cn } from '@/lib/utils';

/**
 * Renders every terminal tab as a mounted PaneGrid. Inactive tabs stay in the
 * DOM (keeps xterm state + PTY alive) but are invisible and positioned
 * offscreen so addon-fit sees valid dimensions.
 *
 * Hydration of persistent tabs happens in `PersistentTabsBootstrap` at the
 * page root so the store is populated before the user switches into terminal
 * mode — we used to hydrate here but TabManager only mounts inside terminal
 * mode, which left the store empty on a fresh load.
 */
export function TabManager() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeTabId);

  if (tabs.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center p-8 text-sm"
        style={{ color: 'var(--fg-3)' }}
      >
        No open terminal tabs.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={cn('absolute inset-0', t.id === activeId ? 'visible z-10' : 'invisible z-0')}
          aria-hidden={t.id !== activeId}
        >
          <PaneGrid tab={t} />
        </div>
      ))}
      {!activeId && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-8 text-center text-sm"
          style={{ color: 'var(--fg-3)' }}
        >
          Select a tab above to open its terminal.
        </div>
      )}
    </div>
  );
}
