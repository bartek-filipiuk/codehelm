'use client';

import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/use-settings';
import { useTerminalStore } from '@/stores/terminal-slice';
import { DEFAULT_TERMINAL_QUICK_ACTIONS } from '@/lib/settings/types';

/**
 * Narrow row of predefined commands dispatched into the active terminal tab.
 * Config lives in Settings (`terminalQuickActions`). Hidden when no tab is
 * active or the list is empty.
 */
export function QuickActions() {
  const { data: settings } = useSettings();
  const actions = settings?.terminalQuickActions ?? DEFAULT_TERMINAL_QUICK_ACTIONS;
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const sendToActive = useTerminalStore((s) => s.sendToActive);

  if (!activeTabId || actions.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-2 py-1 text-xs"
      role="toolbar"
      aria-label="Terminal quick actions"
    >
      {actions.map((a, i) => (
        <Button
          key={`${a.label}-${i}`}
          size="sm"
          variant="ghost"
          className="h-7 px-2 font-mono text-[11px]"
          title={a.command}
          onClick={() => sendToActive(`${a.command}\r`)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
