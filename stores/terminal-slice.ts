import { create } from 'zustand';
import { getTabAlias, patchTabAlias } from '@/lib/ui/tab-aliases';
import {
  deletePersistentTab,
  type ServerPersistentTab,
} from '@/lib/ui/persistent-tab-sync';

export type TerminalLayout = 'single' | 'h' | 'v' | 'quad';

export interface TerminalPane {
  id: string;
  cwd: string;
  shell?: string;
  args?: string[];
  initCommand?: string;
  /** If set, the pane attaches to a persistent PTY instead of spawning. */
  persistentId?: string;
}

export interface TerminalTab {
  id: string;
  projectSlug: string | null;
  cwd: string;
  shell?: string;
  args?: string[];
  /** Command to type into PTY after spawn (e.g. "claude --resume <id>"). */
  initCommand?: string;
  title: string;
  createdAt: number;
  /**
   * Stable key used to persist a rename across app restarts.
   * Examples: `resume:<sessionId>` for resume tabs, `shell:<slug>:<cwd>` for
   * plain shells. Absent for ad-hoc tabs (no persistence).
   */
  aliasKey?: string;
  layout: TerminalLayout;
  panes: TerminalPane[];
  activePaneId: string;
}

export interface TerminalCfg {
  projectSlug?: string | null;
  cwd: string;
  shell?: string;
  args?: string[];
  initCommand?: string;
  title: string;
  aliasKey?: string;
  /** Attach to existing persistent PTY instead of spawning a new one. */
  persistentId?: string;
}

const MAX_TABS = 16;
const TAB_TITLE_MAX_LEN = 40;

export const TERMINAL_TAB_TITLE_MAX_LEN = TAB_TITLE_MAX_LEN;

interface State {
  tabs: TerminalTab[];
  activeTabId: string | null;
  /** Monotonically incremented so id collisions are impossible even in tests. */
  _seq: number;
  /**
   * Live PTY writers keyed by tab id. Each Terminal instance registers its
   * write on mount and unregisters on unmount. Kept here so consumers outside
   * the Terminal tree (e.g. quick actions) can dispatch input into the
   * active tab without prop-drilling or custom events.
   */
  writers: Map<string, (data: string) => void>;
  openTab: (cfg: TerminalCfg) => string | null;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  clear: () => void;
  registerWriter: (id: string, writer: (data: string) => void) => void;
  unregisterWriter: (id: string) => void;
  sendToActive: (data: string) => boolean;
  setLayout: (tabId: string, layout: TerminalLayout) => void;
  setActivePane: (tabId: string, paneId: string) => void;
  closePane: (tabId: string, paneId: string) => void;
  sendToActivePane: (data: string) => boolean;
  /** Attach a server-side persistent PTY id to an already-open pane. */
  setPanePersistentId: (tabId: string, paneId: string, persistentId: string) => void;
  /** Merge server-side persistent tabs into the store, adding any that are not
   * yet represented. Does not disturb existing tabs. */
  hydrate: (tabs: ServerPersistentTab[]) => void;
}

export const useTerminalStore = create<State>((set, get) => ({
  tabs: [],
  activeTabId: null,
  _seq: 0,
  writers: new Map(),
  openTab: (cfg) => {
    const { tabs, _seq } = get();
    if (tabs.length >= MAX_TABS) return null;
    const nextSeq = _seq + 1;
    const id = `t-${Date.now()}-${nextSeq}`;
    const paneId = `p-${Date.now()}-${nextSeq}`;
    const savedAlias = getTabAlias(cfg.aliasKey);
    const pane: TerminalPane = {
      id: paneId,
      cwd: cfg.cwd,
      ...(cfg.shell !== undefined ? { shell: cfg.shell } : {}),
      ...(cfg.args !== undefined ? { args: cfg.args } : {}),
      ...(cfg.initCommand !== undefined ? { initCommand: cfg.initCommand } : {}),
      ...(cfg.persistentId !== undefined ? { persistentId: cfg.persistentId } : {}),
    };
    const tab: TerminalTab = {
      id,
      projectSlug: cfg.projectSlug ?? null,
      cwd: cfg.cwd,
      ...(cfg.shell !== undefined ? { shell: cfg.shell } : {}),
      ...(cfg.args !== undefined ? { args: cfg.args } : {}),
      ...(cfg.initCommand !== undefined ? { initCommand: cfg.initCommand } : {}),
      title: savedAlias ?? cfg.title,
      createdAt: Date.now(),
      ...(cfg.aliasKey ? { aliasKey: cfg.aliasKey } : {}),
      layout: 'single',
      panes: [pane],
      activePaneId: paneId,
    };
    set({ tabs: [...tabs, tab], activeTabId: id, _seq: nextSeq });
    return id;
  },
  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const closing = tabs[idx];
    const next = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      const neighbour = next[idx] ?? next[idx - 1] ?? null;
      nextActive = neighbour?.id ?? null;
    }
    set({ tabs: next, activeTabId: nextActive });
    // Explicit close = kill the PTY on the server side for every persistent
    // pane belonging to this tab. Fire-and-forget; the UI is already updated.
    if (closing) {
      for (const pane of closing.panes) {
        if (pane.persistentId) deletePersistentTab(pane.persistentId);
      }
    }
  },
  setActive: (id) => {
    if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id });
  },
  renameTab: (id, title) => {
    const trimmed = title.trim().slice(0, TAB_TITLE_MAX_LEN);
    if (!trimmed) return;
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    set({ tabs: tabs.map((t) => (t.id === id ? { ...t, title: trimmed } : t)) });
    if (tab.aliasKey) patchTabAlias(tab.aliasKey, trimmed);
  },
  clear: () => set({ tabs: [], activeTabId: null }),
  registerWriter: (id, writer) => {
    const writers = get().writers;
    writers.set(id, writer);
  },
  unregisterWriter: (id) => {
    const writers = get().writers;
    writers.delete(id);
  },
  sendToActive: (data) => get().sendToActivePane(data),
  sendToActivePane: (data) => {
    const { tabs, activeTabId, writers } = get();
    if (!activeTabId) return false;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return false;
    const writer = writers.get(tab.activePaneId);
    if (!writer) return false;
    writer(data);
    return true;
  },
  setLayout: (tabId, layout) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const target = layout === 'single' ? 1 : layout === 'quad' ? 4 : 2;
    let panes = tab.panes.slice();
    let activePaneId = tab.activePaneId;
    let seq = state._seq;
    if (panes.length > target) {
      const keep = panes.find((p) => p.id === activePaneId) ?? panes[0];
      if (!keep) return;
      panes = [keep, ...panes.filter((p) => p.id !== keep.id)].slice(0, target);
      const first = panes[0];
      if (first && !panes.some((p) => p.id === activePaneId)) activePaneId = first.id;
    } else if (panes.length < target) {
      const tmpl = panes[0];
      if (!tmpl) return;
      while (panes.length < target) {
        seq += 1;
        panes.push({
          id: `p-${Date.now()}-${seq}`,
          cwd: tmpl.cwd,
          ...(tmpl.shell !== undefined ? { shell: tmpl.shell } : {}),
          ...(tmpl.args !== undefined ? { args: tmpl.args } : {}),
        });
      }
    }
    set({
      _seq: seq,
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, layout, panes, activePaneId } : t,
      ),
    });
  },
  setActivePane: (tabId, paneId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && t.panes.some((p) => p.id === paneId)
          ? { ...t, activePaneId: paneId }
          : t,
      ),
    }));
  },
  closePane: (tabId, paneId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const closingPane = tab.panes.find((p) => p.id === paneId);
    const remaining = tab.panes.filter((p) => p.id !== paneId);
    if (remaining.length === 0) {
      get().closeTab(tabId);
      return;
    }
    const layout: TerminalLayout =
      remaining.length === 1
        ? 'single'
        : remaining.length === 2
          ? tab.layout === 'v'
            ? 'v'
            : 'h'
          : 'quad';
    const activePaneId =
      tab.activePaneId === paneId ? (remaining[0]?.id ?? tab.activePaneId) : tab.activePaneId;
    state.writers.delete(paneId);
    set({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, panes: remaining, layout, activePaneId } : t,
      ),
    });
    if (closingPane?.persistentId) deletePersistentTab(closingPane.persistentId);
  },
  setPanePersistentId: (tabId, paneId, persistentId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id !== tabId
          ? t
          : {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId ? { ...p, persistentId } : p,
              ),
            },
      ),
    }));
  },
  hydrate: (serverTabs) => {
    if (!serverTabs.length) return;
    const state = get();
    const knownPersistentIds = new Set<string>();
    for (const t of state.tabs) {
      for (const p of t.panes) {
        if (p.persistentId) knownPersistentIds.add(p.persistentId);
      }
    }
    const toAdd = serverTabs.filter((t) => !knownPersistentIds.has(t.persistentId));
    if (toAdd.length === 0) return;
    const cap = Math.max(0, MAX_TABS - state.tabs.length);
    const take = toAdd.slice(0, cap);
    let seq = state._seq;
    const now = Date.now();
    const newTabs: TerminalTab[] = take.map((s) => {
      seq += 1;
      const tabId = `t-${now}-${seq}-h`;
      const paneId = `p-${now}-${seq}-h`;
      const savedAlias = getTabAlias(s.aliasKey ?? undefined);
      const pane: TerminalPane = {
        id: paneId,
        cwd: s.cwd,
        ...(s.shell !== undefined ? { shell: s.shell } : {}),
        ...(s.args !== undefined ? { args: s.args } : {}),
        persistentId: s.persistentId,
      };
      return {
        id: tabId,
        projectSlug: s.projectSlug ?? null,
        cwd: s.cwd,
        ...(s.shell !== undefined ? { shell: s.shell } : {}),
        ...(s.args !== undefined ? { args: s.args } : {}),
        title: savedAlias ?? s.title,
        createdAt: s.createdAt,
        ...(s.aliasKey ? { aliasKey: s.aliasKey } : {}),
        layout: 'single' as TerminalLayout,
        panes: [pane],
        activePaneId: paneId,
      };
    });
    set((curr) => ({
      _seq: seq,
      tabs: [...curr.tabs, ...newTabs],
      activeTabId: curr.activeTabId ?? newTabs[0]?.id ?? null,
    }));
  },
}));

export const TERMINAL_TAB_CAP = MAX_TABS;
