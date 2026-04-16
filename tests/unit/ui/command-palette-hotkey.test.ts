import { describe, it, expect } from 'vitest';
import { isPaletteHotkey } from '@/lib/ui/command-palette-hotkey';

function makeEvent(init: {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  defaultPrevented?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrl ?? false,
    metaKey: init.meta ?? false,
    altKey: init.alt ?? false,
    shiftKey: init.shift ?? false,
    defaultPrevented: init.defaultPrevented ?? false,
  } as unknown as KeyboardEvent;
}

describe('isPaletteHotkey', () => {
  it('matches Ctrl+K', () => {
    expect(isPaletteHotkey(makeEvent({ key: 'k', ctrl: true }))).toBe(true);
  });

  it('matches Cmd+K', () => {
    expect(isPaletteHotkey(makeEvent({ key: 'k', meta: true }))).toBe(true);
  });

  it('is case insensitive for K', () => {
    expect(isPaletteHotkey(makeEvent({ key: 'K', ctrl: true }))).toBe(true);
  });

  it('rejects plain K with no modifiers', () => {
    expect(isPaletteHotkey(makeEvent({ key: 'k' }))).toBe(false);
  });

  it('rejects Alt+K and Shift+K combos', () => {
    expect(isPaletteHotkey(makeEvent({ key: 'k', ctrl: true, shift: true }))).toBe(false);
    expect(isPaletteHotkey(makeEvent({ key: 'k', alt: true }))).toBe(false);
  });

  it('rejects other keys', () => {
    expect(isPaletteHotkey(makeEvent({ key: 'p', ctrl: true }))).toBe(false);
  });

  it('respects defaultPrevented', () => {
    expect(
      isPaletteHotkey(makeEvent({ key: 'k', ctrl: true, defaultPrevented: true })),
    ).toBe(false);
  });
});
