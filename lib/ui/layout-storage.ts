export const LAYOUT_STORAGE_KEY = 'codehelm:layout';

export type SortMode = 'activity' | 'name' | 'sessions';
export type ProjectGrouping = 'flat' | 'prefix';

export interface LayoutState {
  sidebar?: number;
  sessions?: number;
  sortMode?: SortMode;
  editorPreview?: boolean;
  projectGrouping?: ProjectGrouping;
  focusMode?: boolean;
}

const VALID_SORTS: SortMode[] = ['activity', 'name', 'sessions'];
const VALID_GROUPINGS: ProjectGrouping[] = ['flat', 'prefix'];

function readRaw(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadLayout(): LayoutState {
  const raw = readRaw();
  const out: LayoutState = {};
  const sidebar = raw['sidebar'];
  if (typeof sidebar === 'number' && Number.isFinite(sidebar)) out.sidebar = sidebar;
  const sessions = raw['sessions'];
  if (typeof sessions === 'number' && Number.isFinite(sessions)) out.sessions = sessions;
  const sortMode = raw['sortMode'];
  if (typeof sortMode === 'string' && VALID_SORTS.includes(sortMode as SortMode)) {
    out.sortMode = sortMode as SortMode;
  }
  const editorPreview = raw['editorPreview'];
  if (typeof editorPreview === 'boolean') out.editorPreview = editorPreview;
  const projectGrouping = raw['projectGrouping'];
  if (
    typeof projectGrouping === 'string' &&
    VALID_GROUPINGS.includes(projectGrouping as ProjectGrouping)
  ) {
    out.projectGrouping = projectGrouping as ProjectGrouping;
  }
  const focusMode = raw['focusMode'];
  if (typeof focusMode === 'boolean') out.focusMode = focusMode;
  return out;
}

export function patchLayout(partial: LayoutState): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = readRaw();
    const next = { ...raw, ...partial };
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // swallow quota / access errors
  }
}

export function isSortMode(value: unknown): value is SortMode {
  return typeof value === 'string' && VALID_SORTS.includes(value as SortMode);
}

export function isProjectGrouping(value: unknown): value is ProjectGrouping {
  return typeof value === 'string' && VALID_GROUPINGS.includes(value as ProjectGrouping);
}
