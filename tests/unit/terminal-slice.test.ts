// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTerminalStore, TERMINAL_TAB_CAP } from '@/stores/terminal-slice';
import { getTabAlias } from '@/lib/ui/tab-aliases';

beforeEach(() => {
  useTerminalStore.getState().clear();
  if (typeof window !== 'undefined') window.localStorage.clear();
});

describe('terminal-slice', () => {
  it('openTab appends a tab and sets it active', () => {
    const id = useTerminalStore.getState().openTab({ cwd: '/tmp/a', title: 'a' });
    expect(id).not.toBeNull();
    const s = useTerminalStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(id);
  });

  it('openTab initializes layout="single" with one pane holding shell config', () => {
    const id = useTerminalStore.getState().openTab({
      cwd: '/tmp/a',
      title: 'a',
      initCommand: 'echo hi',
    })!;
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.layout).toBe('single');
    expect(tab.panes).toHaveLength(1);
    expect(tab.panes[0]!.cwd).toBe('/tmp/a');
    expect(tab.panes[0]!.initCommand).toBe('echo hi');
    expect(tab.activePaneId).toBe(tab.panes[0]!.id);
  });

  it('caps at 16 tabs — the 17th returns null', () => {
    const s = useTerminalStore.getState();
    for (let i = 0; i < TERMINAL_TAB_CAP; i++) {
      s.openTab({ cwd: `/tmp/${i}`, title: `t${i}` });
    }
    expect(useTerminalStore.getState().tabs).toHaveLength(TERMINAL_TAB_CAP);
    const id17 = useTerminalStore.getState().openTab({ cwd: '/tmp/17', title: 't17' });
    expect(id17).toBeNull();
    expect(useTerminalStore.getState().tabs).toHaveLength(TERMINAL_TAB_CAP);
  });

  it('closeTab sets active to a neighbouring tab', () => {
    const s = useTerminalStore.getState();
    const a = s.openTab({ cwd: '/a', title: 'a' })!;
    const b = s.openTab({ cwd: '/b', title: 'b' })!;
    const c = s.openTab({ cwd: '/c', title: 'c' })!;
    useTerminalStore.getState().setActive(b);
    useTerminalStore.getState().closeTab(b);
    const next = useTerminalStore.getState();
    expect(next.tabs.map((t) => t.id)).toEqual([a, c]);
    expect(next.activeTabId).toBe(c);
  });

  it('closeTab on the last tab clears activeTabId', () => {
    const s = useTerminalStore.getState();
    const a = s.openTab({ cwd: '/a', title: 'a' })!;
    useTerminalStore.getState().closeTab(a);
    expect(useTerminalStore.getState().activeTabId).toBeNull();
    expect(useTerminalStore.getState().tabs).toHaveLength(0);
  });

  it('setActive ignores unknown ids', () => {
    const s = useTerminalStore.getState();
    const a = s.openTab({ cwd: '/a', title: 'a' })!;
    useTerminalStore.getState().setActive('nope');
    expect(useTerminalStore.getState().activeTabId).toBe(a);
  });

  describe('renameTab', () => {
    it('updates the title of an existing tab', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'original' })!;
      useTerminalStore.getState().renameTab(id, 'my alias');
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('my alias');
    });

    it('trims whitespace and rejects empty-after-trim input', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'original' })!;
      useTerminalStore.getState().renameTab(id, '  spaced  ');
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('spaced');

      useTerminalStore.getState().renameTab(id, '   ');
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('spaced');
    });

    it('caps at the 40-char limit', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'original' })!;
      const huge = 'x'.repeat(100);
      useTerminalStore.getState().renameTab(id, huge);
      const after = useTerminalStore.getState().tabs.find((t) => t.id === id)?.title ?? '';
      expect(after.length).toBe(40);
    });

    it('is a no-op for unknown ids', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'original' })!;
      useTerminalStore.getState().renameTab('nope', 'other');
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('original');
    });

    it('persists rename to localStorage when aliasKey is present', () => {
      const id = useTerminalStore
        .getState()
        .openTab({ cwd: '/a', title: 'generic', aliasKey: 'resume:abc' })!;
      useTerminalStore.getState().renameTab(id, 'my tab');
      expect(getTabAlias('resume:abc')).toBe('my tab');
    });

    it('does NOT persist rename when aliasKey is absent', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'generic' })!;
      useTerminalStore.getState().renameTab(id, 'my tab');
      expect(getTabAlias('resume:abc')).toBeNull();
      // store still updates the in-memory title
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('my tab');
    });
  });

  describe('pane layouts', () => {
    it('setLayout("quad") grows panes to 4 with same cwd/shell defaults', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/x', title: 'x' })!;
      useTerminalStore.getState().setLayout(id, 'quad');
      const tab = useTerminalStore.getState().tabs.find((t) => t.id === id)!;
      expect(tab.layout).toBe('quad');
      expect(tab.panes).toHaveLength(4);
      expect(tab.panes[1]!.cwd).toBe('/x');
      expect(tab.panes[1]!.initCommand).toBeUndefined();
      expect(tab.activePaneId).toBe(tab.panes[0]!.id);
    });

    it('setLayout("single") shrinks panes to 1 (keeps active one)', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/x', title: 'x' })!;
      useTerminalStore.getState().setLayout(id, 'quad');
      const afterQuad = useTerminalStore.getState().tabs.find((t) => t.id === id)!;
      const keepId = afterQuad.panes[2]!.id;
      useTerminalStore.getState().setActivePane(id, keepId);
      useTerminalStore.getState().setLayout(id, 'single');
      const tab = useTerminalStore.getState().tabs.find((t) => t.id === id)!;
      expect(tab.layout).toBe('single');
      expect(tab.panes).toHaveLength(1);
      expect(tab.panes[0]!.id).toBe(keepId);
      expect(tab.activePaneId).toBe(keepId);
    });

    it('closePane removes the pane; if it was last the tab closes', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/x', title: 'x' })!;
      useTerminalStore.getState().setLayout(id, 'h');
      const tab = useTerminalStore.getState().tabs.find((t) => t.id === id)!;
      const victim = tab.panes[1]!.id;
      useTerminalStore.getState().closePane(id, victim);
      const after = useTerminalStore.getState().tabs.find((t) => t.id === id)!;
      expect(after.panes).toHaveLength(1);
      expect(after.layout).toBe('single');
      useTerminalStore.getState().closePane(id, after.panes[0]!.id);
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)).toBeUndefined();
    });

    it('setActivePane refuses unknown paneId', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/x', title: 'x' })!;
      const orig = useTerminalStore.getState().tabs.find((t) => t.id === id)!.activePaneId;
      useTerminalStore.getState().setActivePane(id, 'nope');
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)!.activePaneId).toBe(orig);
    });

    it('sendToActivePane routes to writer keyed by activePaneId', () => {
      const id = useTerminalStore.getState().openTab({ cwd: '/x', title: 'x' })!;
      const paneId = useTerminalStore.getState().tabs.find((t) => t.id === id)!.activePaneId;
      const writer = vi.fn();
      useTerminalStore.getState().registerWriter(paneId, writer);
      const ok = useTerminalStore.getState().sendToActivePane('hi\r');
      expect(ok).toBe(true);
      expect(writer).toHaveBeenCalledWith('hi\r');
    });
  });

  describe('openTab alias hydration', () => {
    it('applies a stored alias when the key matches', () => {
      // Pre-seed as if a previous session wrote this.
      window.localStorage.setItem(
        'codehelm:tab-aliases',
        JSON.stringify({ 'resume:abc': 'saved alias' }),
      );
      const id = useTerminalStore
        .getState()
        .openTab({ cwd: '/a', title: 'default title', aliasKey: 'resume:abc' })!;
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('saved alias');
    });

    it('falls back to cfg.title when no alias is stored', () => {
      const id = useTerminalStore
        .getState()
        .openTab({ cwd: '/a', title: 'default title', aliasKey: 'resume:xyz' })!;
      expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe(
        'default title',
      );
    });
  });
});
