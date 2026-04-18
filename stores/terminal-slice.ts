import { create } from 'zustand';
import { getTabAlias, patchTabAlias } from '@/lib/ui/tab-aliases';

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
}

export interface TerminalCfg {
  projectSlug?: string | null;
  cwd: string;
  shell?: string;
  args?: string[];
  initCommand?: string;
  title: string;
  aliasKey?: string;
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
}

export const useTerminalStore = create<State>((set, get) => ({
  tabs: [],
  activeTabId: null,
  _seq: 0,
  writers: new Map(),
  openTab: (cfg) => {
    const { tabs, _seq } = get();
    if (tabs.length >= MAX_TABS) return null;
    const id = `t-${Date.now()}-${_seq + 1}`;
    const savedAlias = getTabAlias(cfg.aliasKey);
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
    };
    set({ tabs: [...tabs, tab], activeTabId: id, _seq: _seq + 1 });
    return id;
  },
  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      const neighbour = next[idx] ?? next[idx - 1] ?? null;
      nextActive = neighbour?.id ?? null;
    }
    set({ tabs: next, activeTabId: nextActive });
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
  sendToActive: (data) => {
    const { activeTabId, writers } = get();
    if (!activeTabId) return false;
    const writer = writers.get(activeTabId);
    if (!writer) return false;
    writer(data);
    return true;
  },
}));

export const TERMINAL_TAB_CAP = MAX_TABS;
