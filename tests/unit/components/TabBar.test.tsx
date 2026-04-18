import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from '@/app/(ui)/terminal/TabBar';
import { useTerminalStore } from '@/stores/terminal-slice';

beforeEach(() => {
  useTerminalStore.getState().clear();
});
afterEach(() => cleanup());

describe('<TabBar /> rename flow', () => {
  it('double-click on title enters edit mode and Enter commits', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'shell (a)' })!;
    render(<TabBar />);

    const label = screen.getByText('shell (a)');
    await user.dblClick(label);

    const input = screen.getByRole('textbox', { name: /rename tab/i }) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('shell (a)');

    await user.clear(input);
    await user.type(input, 'my alias{Enter}');

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('my alias');
    expect(screen.queryByRole('textbox', { name: /rename tab/i })).toBeNull();
  });

  it('Escape cancels without mutating', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'orig' })!;
    render(<TabBar />);

    await user.dblClick(screen.getByText('orig'));
    const input = screen.getByRole('textbox', { name: /rename tab/i });
    await user.clear(input);
    await user.type(input, 'changed{Escape}');

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('orig');
    expect(screen.queryByRole('textbox', { name: /rename tab/i })).toBeNull();
  });

  it('blur commits the current draft', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'orig' })!;
    render(<TabBar />);

    await user.dblClick(screen.getByText('orig'));
    const input = screen.getByRole('textbox', { name: /rename tab/i });
    await user.clear(input);
    await user.type(input, 'blurred');
    fireEvent.blur(input);

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('blurred');
  });

  it('empty input is ignored on commit (stays on original)', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'orig' })!;
    render(<TabBar />);

    await user.dblClick(screen.getByText('orig'));
    const input = screen.getByRole('textbox', { name: /rename tab/i });
    await user.clear(input);
    await user.type(input, '   {Enter}');

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('orig');
  });
});
