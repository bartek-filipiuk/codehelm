import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from '@/app/(ui)/terminal/TabBar';
import { useTerminalStore } from '@/stores/terminal-slice';

beforeEach(() => {
  useTerminalStore.getState().clear();
});
afterEach(() => cleanup());

describe('<TabBar /> edit popover', () => {
  it('double-click on title opens the editor and Enter saves the title', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'shell (a)' })!;
    render(<TabBar />);

    await user.dblClick(screen.getByText('shell (a)'));

    const titleInput = screen.getByRole('textbox', { name: /tab title/i }) as HTMLInputElement;
    expect(titleInput.value).toBe('shell (a)');

    await user.clear(titleInput);
    await user.type(titleInput, 'my alias{Enter}');

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('my alias');
    expect(screen.queryByRole('textbox', { name: /tab title/i })).toBeNull();
  });

  it('Escape closes the editor without mutating', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'orig' })!;
    render(<TabBar />);

    await user.dblClick(screen.getByText('orig'));
    const titleInput = screen.getByRole('textbox', { name: /tab title/i });
    await user.clear(titleInput);
    await user.type(titleInput, 'changed{Escape}');

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('orig');
    expect(screen.queryByRole('textbox', { name: /tab title/i })).toBeNull();
  });

  it('blank title is ignored on save (stays on original)', async () => {
    const user = userEvent.setup();
    const id = useTerminalStore.getState().openTab({ cwd: '/a', title: 'orig' })!;
    render(<TabBar />);

    await user.dblClick(screen.getByText('orig'));
    const titleInput = screen.getByRole('textbox', { name: /tab title/i });
    await user.clear(titleInput);
    await user.type(titleInput, '   {Enter}');

    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)?.title).toBe('orig');
  });

  it('restart-command field is disabled when the tab is not yet persistent', async () => {
    const user = userEvent.setup();
    useTerminalStore.getState().openTab({ cwd: '/a', title: 'orig' });
    render(<TabBar />);

    await user.dblClick(screen.getByText('orig'));
    const cmdInput = screen.getByRole('textbox', { name: /restart command/i }) as HTMLInputElement;
    expect(cmdInput.disabled).toBe(true);
  });
});

