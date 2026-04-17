export const RECENT_FILES_KEY = 'claude-ui:recent-md';
export const RECENT_FILES_MAX = 10;

export type RecentFileKind = 'global' | 'project';

export interface RecentFileEntry {
  kind: RecentFileKind;
  /** Present only when kind === 'project'. */
  slug?: string;
  label: string;
  openedAt: string;
}

export type NewRecentFile =
  | { kind: 'global'; label: string }
  | { kind: 'project'; slug: string; label: string };

function sameTarget(a: RecentFileEntry, b: NewRecentFile): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'global') return true;
  // Both are project entries here; narrow for TS.
  return a.slug === (b as { slug: string }).slug;
}

function isRecentFileEntry(raw: unknown): raw is RecentFileEntry {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Record<string, unknown>;
  const kind = e['kind'];
  if (kind !== 'global' && kind !== 'project') return false;
  if (kind === 'project' && typeof e['slug'] !== 'string') return false;
  if (typeof e['label'] !== 'string') return false;
  if (typeof e['openedAt'] !== 'string') return false;
  return true;
}

/**
 * Pure LRU reducer — takes the current list and a new entry, returns a new
 * list with the entry at the front, any duplicate target dropped, and the
 * whole thing truncated to RECENT_FILES_MAX.
 */
export function applyRecentFile(
  current: readonly RecentFileEntry[],
  entry: NewRecentFile,
  now: () => string = () => new Date().toISOString(),
): RecentFileEntry[] {
  const deduped = current.filter((e) => !sameTarget(e, entry));
  const next: RecentFileEntry =
    entry.kind === 'global'
      ? { kind: 'global', label: entry.label, openedAt: now() }
      : { kind: 'project', slug: entry.slug, label: entry.label, openedAt: now() };
  return [next, ...deduped].slice(0, RECENT_FILES_MAX);
}

export function loadRecentFiles(): RecentFileEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RecentFileEntry[] = [];
    for (const item of parsed) {
      if (!isRecentFileEntry(item)) continue;
      out.push(item);
      if (out.length >= RECENT_FILES_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function saveRecentFiles(list: readonly RecentFileEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list.slice(0, RECENT_FILES_MAX)));
  } catch {
    // swallow quota / access errors
  }
}

export function pushRecentFile(entry: NewRecentFile): RecentFileEntry[] {
  const next = applyRecentFile(loadRecentFiles(), entry);
  saveRecentFiles(next);
  return next;
}
