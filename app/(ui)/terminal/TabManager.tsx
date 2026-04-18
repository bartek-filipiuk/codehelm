'use client';

import { useEffect, useRef } from 'react';
import { useTerminalStore } from '@/stores/terminal-slice';
import { PaneGrid } from '@/components/terminal/PaneGrid';
import { cn } from '@/lib/utils';
import { fetchPersistentTabs } from '@/lib/ui/persistent-tab-sync';

/**
 * Renders every terminal tab as a mounted PaneGrid. Inactive tabs stay in the
 * DOM (keeps xterm state + PTY alive) but are invisible and positioned
 * offscreen so addon-fit sees valid dimensions.
 *
 * On first mount we also hydrate the store with any persistent tabs that the
 * server already knows about (browser reload, server restart with auto-respawn)
 * so the user's workspace reappears without action.
 */
export function TabManager() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeTabId);
  const hydrate = useTerminalStore((s) => s.hydrate);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void fetchPersistentTabs().then((serverTabs) => {
      if (serverTabs.length > 0) hydrate(serverTabs);
    });
  }, [hydrate]);

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
    </div>
  );
}
