import { create } from 'zustand';

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
}

export interface TerminalCfg {
  projectSlug?: string | null;
  cwd: string;
  shell?: string;
  args?: string[];
  initCommand?: string;
  title: string;
}

const MAX_TABS = 16;

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
    const tab: TerminalTab = {
      id,
      projectSlug: cfg.projectSlug ?? null,
      cwd: cfg.cwd,
      ...(cfg.shell !== undefined ? { shell: cfg.shell } : {}),
      ...(cfg.args !== undefined ? { args: cfg.args } : {}),
      ...(cfg.initCommand !== undefined ? { initCommand: cfg.initCommand } : {}),
      title: cfg.title,
      createdAt: Date.now(),
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
