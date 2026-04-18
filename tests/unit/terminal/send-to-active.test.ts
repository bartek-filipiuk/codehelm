import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalStore, type TerminalTab } from '@/stores/terminal-slice';

function makeTab(id: string, paneId: string): TerminalTab {
  return {
    id,
    projectSlug: null,
    cwd: '/',
    title: id,
    createdAt: 0,
    layout: 'single',
    panes: [{ id: paneId, cwd: '/' }],
    activePaneId: paneId,
  };
}

beforeEach(() => {
  // Fresh store per test — Zustand stores are module singletons.
  useTerminalStore.setState({
    tabs: [],
    activeTabId: null,
    writers: new Map(),
    _seq: 0,
  });
});

describe('terminal writer registry', () => {
  it('sendToActive returns false when no tab is active', () => {
    const { sendToActive } = useTerminalStore.getState();
    expect(sendToActive('hi\r')).toBe(false);
  });

  it('sendToActive returns false when no writer is registered for the active pane', () => {
    useTerminalStore.setState({
      tabs: [makeTab('t-1', 'p-1')],
      activeTabId: 't-1',
    });
    const { sendToActive } = useTerminalStore.getState();
    expect(sendToActive('hi\r')).toBe(false);
  });

  it('registerWriter makes sendToActive deliver to the active pane', () => {
    const writer = vi.fn();
    useTerminalStore.setState({
      tabs: [makeTab('t-1', 'p-1')],
      activeTabId: 't-1',
    });
    useTerminalStore.getState().registerWriter('p-1', writer);
    const ok = useTerminalStore.getState().sendToActive('git status\r');
    expect(ok).toBe(true);
    expect(writer).toHaveBeenCalledWith('git status\r');
  });

  it('sends only to the active tab, not all registered ones', () => {
    const w1 = vi.fn();
    const w2 = vi.fn();
    useTerminalStore.setState({
      tabs: [makeTab('t-1', 'p-1'), makeTab('t-2', 'p-2')],
      activeTabId: 't-2',
    });
    const s = useTerminalStore.getState();
    s.registerWriter('p-1', w1);
    s.registerWriter('p-2', w2);
    useTerminalStore.getState().sendToActive('hi\r');
    expect(w1).not.toHaveBeenCalled();
    expect(w2).toHaveBeenCalledTimes(1);
  });

  it('unregisterWriter stops subsequent sends', () => {
    const writer = vi.fn();
    useTerminalStore.setState({
      tabs: [makeTab('t-1', 'p-1')],
      activeTabId: 't-1',
    });
    const s = useTerminalStore.getState();
    s.registerWriter('p-1', writer);
    s.unregisterWriter('p-1');
    expect(useTerminalStore.getState().sendToActive('hi\r')).toBe(false);
    expect(writer).not.toHaveBeenCalled();
  });
});
