import { create } from 'zustand';
import {
  isProjectGrouping,
  isSortMode,
  loadLayout,
  patchLayout,
  type ProjectGrouping,
  type SortMode,
} from '@/lib/ui/layout-storage';

export type { ProjectGrouping, SortMode };

interface UiState {
  selectedProjectSlug: string | null;
  selectedSessionId: string | null;
  search: string;
  terminalOpen: boolean;
  terminalCwd: string | null;
  editorOpen: boolean;
  /** One-shot: Viewer consumes this, scrolls to the event, and clears it. */
  pendingEventIndex: number | null;
  sortMode: SortMode;
  projectGrouping: ProjectGrouping;
  focusMode: boolean;
  setSelectedProject: (slug: string | null) => void;
  setSelectedSession: (id: string | null) => void;
  setSearch: (q: string) => void;
  openTerminal: (cwd: string) => void;
  closeTerminal: () => void;
  openEditor: () => void;
  closeEditor: () => void;
  jumpToEvent: (index: number) => void;
  consumePendingEvent: () => void;
  setSortMode: (mode: SortMode) => void;
  setProjectGrouping: (grouping: ProjectGrouping) => void;
  setFocusMode: (value: boolean) => void;
  toggleFocusMode: () => void;
}

const DEFAULT_SORT: SortMode = 'activity';
const DEFAULT_GROUPING: ProjectGrouping = 'flat';

function initialSortMode(): SortMode {
  if (typeof window === 'undefined') return DEFAULT_SORT;
  const stored = loadLayout().sortMode;
  return isSortMode(stored) ? stored : DEFAULT_SORT;
}

function initialProjectGrouping(): ProjectGrouping {
  if (typeof window === 'undefined') return DEFAULT_GROUPING;
  const stored = loadLayout().projectGrouping;
  return isProjectGrouping(stored) ? stored : DEFAULT_GROUPING;
}

function initialFocusMode(): boolean {
  if (typeof window === 'undefined') return false;
  return loadLayout().focusMode === true;
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectSlug: null,
  selectedSessionId: null,
  search: '',
  terminalOpen: false,
  terminalCwd: null,
  editorOpen: false,
  pendingEventIndex: null,
  sortMode: initialSortMode(),
  projectGrouping: initialProjectGrouping(),
  focusMode: initialFocusMode(),
  setSelectedProject: (slug) =>
    set(() => ({
      selectedProjectSlug: slug,
      selectedSessionId: null,
      // Do NOT reset `terminalOpen`: persistent tabs stay alive across project
      // switches, so tearing the terminal mode down every time the user picks
      // a project in the sidebar would hide their workspace until they
      // re-click the Terminal tab. Editor is still closed because it is
      // scoped to a single CLAUDE.md file.
      editorOpen: false,
    })),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSearch: (q) => set({ search: q }),
  openTerminal: (cwd) => set({ terminalOpen: true, terminalCwd: cwd, editorOpen: false }),
  closeTerminal: () => set({ terminalOpen: false, terminalCwd: null }),
  openEditor: () => set({ editorOpen: true, terminalOpen: false }),
  closeEditor: () => set({ editorOpen: false }),
  jumpToEvent: (index) => set({ editorOpen: false, terminalOpen: false, pendingEventIndex: index }),
  consumePendingEvent: () => set({ pendingEventIndex: null }),
  setSortMode: (mode) => {
    patchLayout({ sortMode: mode });
    set({ sortMode: mode });
  },
  setProjectGrouping: (grouping) => {
    patchLayout({ projectGrouping: grouping });
    set({ projectGrouping: grouping });
  },
  setFocusMode: (value) => {
    patchLayout({ focusMode: value });
    set({ focusMode: value });
  },
  toggleFocusMode: () =>
    set((state) => {
      const next = !state.focusMode;
      patchLayout({ focusMode: next });
      return { focusMode: next };
    }),
}));
