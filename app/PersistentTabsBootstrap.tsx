'use client';

import { useEffect, useRef } from 'react';
import { useTerminalStore } from '@/stores/terminal-slice';
import { useUiStore } from '@/stores/ui-slice';
import { fetchPersistentTabs } from '@/lib/ui/persistent-tab-sync';

/**
 * Fetches persistent tabs from the server once at mount and hydrates the
 * terminal store. If anything came back, also flips the main panel into
 * terminal mode so the user sees their previous workspace without needing
 * to click anything first.
 *
 * Rendered as a sibling of the main layout (see `app/page.tsx`) so it runs
 * regardless of which panel mode is active — previously hydration lived in
 * `TabManager`, which only mounts inside terminal mode and therefore left
 * the store empty on a fresh browser load.
 */
export function PersistentTabsBootstrap() {
  const hydrate = useTerminalStore((s) => s.hydrate);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void fetchPersistentTabs().then((serverTabs) => {
      if (serverTabs.length === 0) return;
      hydrate(serverTabs);
      const first = serverTabs[0];
      if (first) openTerminal(first.cwd);
    });
  }, [hydrate, openTerminal]);

  return null;
}
