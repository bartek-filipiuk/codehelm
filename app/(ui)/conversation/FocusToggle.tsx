'use client';

import { useEffect } from 'react';

import { CHButton } from '@/components/ui/ch-button';
import { IconFocus } from '@/components/ui/icons';
import { Kbd } from '@/components/ui/kbd';
import { useUiStore } from '@/stores/ui-slice';

function isFocusHotkey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  return event.key === '.';
}

export function FocusToggle() {
  const focusMode = useUiStore((s) => s.focusMode);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isFocusHotkey(event)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      toggleFocusMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFocusMode]);

  return (
    <CHButton
      size="sm"
      variant={focusMode ? 'primary' : 'outline'}
      onClick={toggleFocusMode}
      title={focusMode ? 'Exit focus mode (⌘.)' : 'Enter focus mode (⌘.)'}
      aria-pressed={focusMode}
    >
      <IconFocus /> {focusMode ? 'FOCUS OFF' : 'FOCUS MODE'} <Kbd>⌘.</Kbd>
    </CHButton>
  );
}
