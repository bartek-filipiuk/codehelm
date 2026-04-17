// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyRecentFile,
  loadRecentFiles,
  pushRecentFile,
  RECENT_FILES_KEY,
  RECENT_FILES_MAX,
  saveRecentFiles,
  type RecentFileEntry,
} from '@/lib/ui/recent-files';

const fixed = () => '2026-04-17T12:00:00.000Z';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('applyRecentFile', () => {
  it('puts a new entry at the front', () => {
    const next = applyRecentFile([], { kind: 'global', label: 'Global' }, fixed);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ kind: 'global', label: 'Global', openedAt: fixed() });
  });

  it('deduplicates by target (global matches global)', () => {
    const first = applyRecentFile([], { kind: 'global', label: 'Global' }, fixed);
    const second = applyRecentFile(first, { kind: 'global', label: 'Global' }, fixed);
    expect(second).toHaveLength(1);
  });

  it('deduplicates project entries by slug', () => {
    const first = applyRecentFile([], { kind: 'project', slug: 'abc', label: 'Abc' }, fixed);
    const second = applyRecentFile(
      first,
      { kind: 'project', slug: 'abc', label: 'Abc renamed' },
      fixed,
    );
    expect(second).toHaveLength(1);
    expect(second[0]?.label).toBe('Abc renamed');
  });

  it('treats different slugs as different entries', () => {
    const base = [] as RecentFileEntry[];
    const a = applyRecentFile(base, { kind: 'project', slug: 'a', label: 'A' }, fixed);
    const b = applyRecentFile(a, { kind: 'project', slug: 'b', label: 'B' }, fixed);
    expect(b).toHaveLength(2);
  });

  it('moves an existing entry back to the front', () => {
    const a = applyRecentFile([], { kind: 'project', slug: 'a', label: 'A' }, fixed);
    const b = applyRecentFile(a, { kind: 'project', slug: 'b', label: 'B' }, fixed);
    const reopenedA = applyRecentFile(b, { kind: 'project', slug: 'a', label: 'A' }, fixed);
    expect(reopenedA.map((e) => e.slug)).toEqual(['a', 'b']);
  });

  it('trims the list to RECENT_FILES_MAX', () => {
    let list: RecentFileEntry[] = [];
    for (let i = 0; i < RECENT_FILES_MAX + 3; i++) {
      list = applyRecentFile(list, { kind: 'project', slug: `p${i}`, label: `P${i}` }, fixed);
    }
    expect(list).toHaveLength(RECENT_FILES_MAX);
    expect(list[0]?.slug).toBe(`p${RECENT_FILES_MAX + 2}`);
  });
});

describe('loadRecentFiles', () => {
  it('returns [] when no entry is stored', () => {
    expect(loadRecentFiles()).toEqual([]);
  });

  it('returns [] on malformed JSON', () => {
    window.localStorage.setItem(RECENT_FILES_KEY, '{not valid');
    expect(loadRecentFiles()).toEqual([]);
  });

  it('drops entries that fail shape validation', () => {
    window.localStorage.setItem(
      RECENT_FILES_KEY,
      JSON.stringify([
        { kind: 'bogus', label: 'x', openedAt: 'y' },
        { kind: 'global', label: 'ok', openedAt: '2026-01-01T00:00:00Z' },
      ]),
    );
    const out = loadRecentFiles();
    expect(out).toHaveLength(1);
    expect(out[0]?.label).toBe('ok');
  });

  it('caps reads at RECENT_FILES_MAX', () => {
    const many: RecentFileEntry[] = [];
    for (let i = 0; i < RECENT_FILES_MAX + 5; i++) {
      many.push({
        kind: 'project',
        slug: `p${i}`,
        label: `P${i}`,
        openedAt: '2026-01-01T00:00:00Z',
      });
    }
    window.localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(many));
    expect(loadRecentFiles()).toHaveLength(RECENT_FILES_MAX);
  });
});

describe('saveRecentFiles / pushRecentFile round-trip', () => {
  it('persists and reloads the list', () => {
    const list: RecentFileEntry[] = [
      { kind: 'global', label: 'Global', openedAt: '2026-04-17T12:00:00.000Z' },
      { kind: 'project', slug: 'a', label: 'A', openedAt: '2026-04-17T11:00:00.000Z' },
    ];
    saveRecentFiles(list);
    expect(loadRecentFiles()).toEqual(list);
  });

  it('pushRecentFile prepends and persists in one call', () => {
    pushRecentFile({ kind: 'project', slug: 'a', label: 'A' });
    pushRecentFile({ kind: 'global', label: 'Global' });
    const out = loadRecentFiles();
    expect(out.map((e) => e.kind)).toEqual(['global', 'project']);
  });
});
