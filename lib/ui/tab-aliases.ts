export const TAB_ALIASES_KEY = 'codehelm:tab-aliases';
export const TAB_ALIAS_MAX_LEN = 40;
export const TAB_ALIASES_MAX_ENTRIES = 200;

export type TabAliasMap = Record<string, string>;

function isAliasMap(raw: unknown): raw is TabAliasMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (typeof v !== 'string') return false;
  }
  return true;
}

export function loadTabAliases(): TabAliasMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TAB_ALIASES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isAliasMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTabAliases(next: TabAliasMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TAB_ALIASES_KEY, JSON.stringify(next));
  } catch {
    // swallow quota / private-mode errors
  }
}

/**
 * Writes one alias into the map and persists. Empty alias removes the entry.
 * Caps stored entries so localStorage doesn't grow unbounded.
 */
export function patchTabAlias(key: string, alias: string | null): TabAliasMap {
  const current = loadTabAliases();
  const next: TabAliasMap = { ...current };
  if (alias === null || alias.trim() === '') {
    delete next[key];
  } else {
    next[key] = alias.trim().slice(0, TAB_ALIAS_MAX_LEN);
  }
  // LRU-ish trim: if we exceed the cap, drop arbitrary oldest keys.
  const keys = Object.keys(next);
  if (keys.length > TAB_ALIASES_MAX_ENTRIES) {
    const excess = keys.slice(0, keys.length - TAB_ALIASES_MAX_ENTRIES);
    for (const k of excess) delete next[k];
  }
  saveTabAliases(next);
  return next;
}

export function getTabAlias(key: string | undefined | null): string | null {
  if (!key) return null;
  const map = loadTabAliases();
  return map[key] ?? null;
}
