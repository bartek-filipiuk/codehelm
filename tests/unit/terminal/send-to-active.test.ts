import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalStore } from '@/stores/terminal-slice';

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

  it('sendToActive returns false when no writer is registered for the active tab', () => {
    useTerminalStore.setState({ activeTabId: 't-1' });
    const { sendToActive } = useTerminalStore.getState();
    expect(sendToActive('hi\r')).toBe(false);
  });

  it('registerWriter makes sendToActive deliver to the matching tab', () => {
    const writer = vi.fn();
    const s = useTerminalStore.getState();
    s.registerWriter('t-1', writer);
    useTerminalStore.setState({ activeTabId: 't-1' });
    const ok = useTerminalStore.getState().sendToActive('git status\r');
    expect(ok).toBe(true);
    expect(writer).toHaveBeenCalledWith('git status\r');
  });

  it('sends only to the active tab, not all registered ones', () => {
    const w1 = vi.fn();
    const w2 = vi.fn();
    const s = useTerminalStore.getState();
    s.registerWriter('t-1', w1);
    s.registerWriter('t-2', w2);
    useTerminalStore.setState({ activeTabId: 't-2' });
    useTerminalStore.getState().sendToActive('hi\r');
    expect(w1).not.toHaveBeenCalled();
    expect(w2).toHaveBeenCalledTimes(1);
  });

  it('unregisterWriter stops subsequent sends', () => {
    const writer = vi.fn();
    const s = useTerminalStore.getState();
    s.registerWriter('t-1', writer);
    useTerminalStore.setState({ activeTabId: 't-1' });
    s.unregisterWriter('t-1');
    expect(useTerminalStore.getState().sendToActive('hi\r')).toBe(false);
    expect(writer).not.toHaveBeenCalled();
  });
});
