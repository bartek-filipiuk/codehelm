// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TAB_ALIASES_KEY,
  TAB_ALIAS_MAX_LEN,
  getTabAlias,
  loadTabAliases,
  patchTabAlias,
} from '@/lib/ui/tab-aliases';

beforeEach(() => {
  window.localStorage.clear();
});

describe('tab-aliases', () => {
  it('loadTabAliases returns {} when nothing is stored', () => {
    expect(loadTabAliases()).toEqual({});
  });

  it('loadTabAliases rejects non-object / malformed payloads', () => {
    window.localStorage.setItem(TAB_ALIASES_KEY, 'not json');
    expect(loadTabAliases()).toEqual({});
    window.localStorage.setItem(TAB_ALIASES_KEY, '["array"]');
    expect(loadTabAliases()).toEqual({});
    window.localStorage.setItem(TAB_ALIASES_KEY, JSON.stringify({ ok: 5 }));
    expect(loadTabAliases()).toEqual({});
  });

  it('patchTabAlias writes + getTabAlias reads', () => {
    patchTabAlias('resume:abc', 'my tab');
    expect(getTabAlias('resume:abc')).toBe('my tab');
  });

  it('patchTabAlias trims + caps length', () => {
    patchTabAlias('k', `   ${'x'.repeat(100)}   `);
    const v = getTabAlias('k')!;
    expect(v.length).toBe(TAB_ALIAS_MAX_LEN);
    expect(v.startsWith(' ')).toBe(false);
  });

  it('patchTabAlias(null) or empty removes the key', () => {
    patchTabAlias('k', 'value');
    expect(getTabAlias('k')).toBe('value');
    patchTabAlias('k', null);
    expect(getTabAlias('k')).toBeNull();
    patchTabAlias('k', 'value');
    patchTabAlias('k', '   ');
    expect(getTabAlias('k')).toBeNull();
  });

  it('getTabAlias returns null for undefined / missing keys', () => {
    expect(getTabAlias(undefined)).toBeNull();
    expect(getTabAlias(null)).toBeNull();
    expect(getTabAlias('nothing')).toBeNull();
  });
});
