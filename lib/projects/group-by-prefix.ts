import type { ProjectSummary } from '@/hooks/use-projects';
import type { ProjectMetaMap } from '@/hooks/use-project-meta';

/** Default label for projects whose cwd is missing or outside $HOME. */
export const OTHER_GROUP_LABEL = 'Other';
/** Label used for the favorites-only group when grouping is active. */
export const FAVORITES_GROUP_LABEL = 'Pinned';

/** Stable key for the favorites group. Not a valid path segment. */
export const FAVORITES_GROUP_KEY = '__favorites__';
/** Stable key for projects without a resolvable prefix. */
export const OTHER_GROUP_KEY = '__other__';

export interface ProjectGroup {
  key: string;
  label: string;
  items: ProjectSummary[];
  isFavorites: boolean;
}

export interface GroupOptions {
  /** Absolute $HOME directory. If empty/null the grouper falls back to Linux/macOS heuristics. */
  homeDir?: string | null;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function stripHomePrefix(cwd: string, homeDir: string): string | null {
  const path = normalizePath(cwd);
  const home = normalizePath(homeDir);
  if (!home) return null;
  if (path === home) return '';
  if (path.startsWith(home + '/')) {
    return path.slice(home.length + 1);
  }
  return null;
}

function fallbackStripHome(cwd: string): string | null {
  const path = normalizePath(cwd);
  const match = path.match(/^\/(?:home|Users)\/[^/]+\/(.*)$/);
  return match ? (match[1] ?? '') : null;
}

/**
 * Extracts the first path segment under $HOME. Returns null when the path
 * does not live under $HOME (or any homedir-shaped prefix).
 */
export function prefixSegment(
  cwd: string | null | undefined,
  homeDir?: string | null,
): string | null {
  if (!cwd) return null;
  let relative: string | null = null;
  if (homeDir) {
    relative = stripHomePrefix(cwd, homeDir);
  }
  if (relative === null) {
    relative = fallbackStripHome(cwd);
  }
  if (relative === null) return null;
  if (relative === '') return null;
  const [first] = relative.split('/');
  return first && first.length > 0 ? first : null;
}

/**
 * Groups projects by their first path segment under $HOME.
 * Favorites are hoisted into a dedicated leading group. Items inside each
 * group preserve the order in which they appear in the input.
 */
export function groupProjectsByPrefix(
  projects: ProjectSummary[],
  meta: ProjectMetaMap,
  options: GroupOptions = {},
): ProjectGroup[] {
  const { homeDir } = options;
  const favorites: ProjectSummary[] = [];
  const byPrefix = new Map<string, ProjectSummary[]>();

  for (const project of projects) {
    if (meta[project.slug]?.favorite === true) {
      favorites.push(project);
      continue;
    }
    const segment = prefixSegment(project.resolvedCwd, homeDir);
    const key = segment ?? OTHER_GROUP_KEY;
    let bucket = byPrefix.get(key);
    if (!bucket) {
      bucket = [];
      byPrefix.set(key, bucket);
    }
    bucket.push(project);
  }

  const groups: ProjectGroup[] = [];
  if (favorites.length > 0) {
    groups.push({
      key: FAVORITES_GROUP_KEY,
      label: FAVORITES_GROUP_LABEL,
      items: favorites,
      isFavorites: true,
    });
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const prefixKeys = Array.from(byPrefix.keys()).sort((a, b) => {
    if (a === OTHER_GROUP_KEY) return 1;
    if (b === OTHER_GROUP_KEY) return -1;
    return collator.compare(a, b);
  });

  for (const key of prefixKeys) {
    const items = byPrefix.get(key);
    if (!items || items.length === 0) continue;
    groups.push({
      key,
      label: key === OTHER_GROUP_KEY ? OTHER_GROUP_LABEL : key,
      items,
      isFavorites: false,
    });
  }

  return groups;
}
