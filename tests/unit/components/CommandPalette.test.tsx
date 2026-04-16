import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';
import {
  CommandPalette,
  sortByActivityDesc,
  sortByAliasAsc,
  toPaletteProjects,
} from '@/components/CommandPalette';
import { useUiStore } from '@/stores/ui-slice';
import { useTerminalStore } from '@/stores/terminal-slice';
import type { ProjectSummary } from '@/hooks/use-projects';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const sampleProjects: ProjectSummary[] = [
  {
    slug: '-home-user-alpha',
    displayPath: '/home/user/alpha',
    resolvedCwd: '/home/user/alpha',
    sessionCount: 2,
    lastActivity: '2026-04-10T12:00:00Z',
    totalBytes: 1024,
  },
  {
    slug: '-home-user-beta',
    displayPath: '/home/user/beta',
    resolvedCwd: '/home/user/beta',
    sessionCount: 5,
    lastActivity: '2026-04-15T12:00:00Z',
    totalBytes: 2048,
  },
];

beforeEach(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
      MockResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  useUiStore.setState({
    selectedProjectSlug: null,
    selectedSessionId: null,
    search: '',
    terminalOpen: false,
    terminalCwd: null,
    editorOpen: false,
  });
  useTerminalStore.setState({ tabs: [], activeTabId: null, _seq: 0 });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/projects')) {
      return Response.json(
        { projects: sampleProjects },
        { headers: { 'cache-control': 'no-store' } },
      ) as Response;
    }
    if (url.endsWith('/api/projects/meta')) {
      return Response.json(
        { entries: { '-home-user-alpha': { alias: 'Alpha' } } },
      ) as Response;
    }
    return new Response('not found', { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function dispatchCtrlK() {
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

describe('palette sort helpers', () => {
  it('sortByActivityDesc puts most recent first', () => {
    const palette = toPaletteProjects(sampleProjects, {
      '-home-user-alpha': { alias: 'Alpha' },
    });
    const sorted = sortByActivityDesc(palette);
    expect(sorted[0]?.slug).toBe('-home-user-beta');
    expect(sorted[1]?.slug).toBe('-home-user-alpha');
  });

  it('sortByAliasAsc orders by alias/name ascending', () => {
    const palette = toPaletteProjects(sampleProjects, {
      '-home-user-alpha': { alias: 'Alpha' },
      '-home-user-beta': { alias: 'Beta' },
    });
    const sorted = sortByAliasAsc(palette);
    expect(sorted.map((p) => p.slug)).toEqual(['-home-user-alpha', '-home-user-beta']);
  });
});

describe('<CommandPalette />', () => {
  it('opens on Ctrl+K and closes on second press', async () => {
    render(<CommandPalette />, { wrapper });
    expect(screen.queryByTestId('command-palette')).toBeNull();
    act(() => {
      dispatchCtrlK();
    });
    expect(screen.getByTestId('command-palette')).toBeDefined();
    act(() => {
      dispatchCtrlK();
    });
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('lists the core actions', async () => {
    render(<CommandPalette />, { wrapper });
    act(() => {
      dispatchCtrlK();
    });
    expect(screen.getByText('Nowy shell w bieżącym projekcie')).toBeDefined();
    expect(screen.getByText('Otwórz CLAUDE.md (globalny)')).toBeDefined();
    expect(screen.getByText('Otwórz CLAUDE.md (bieżący projekt)')).toBeDefined();
    expect(screen.getByText('Zamknij bieżącą kartę terminala')).toBeDefined();
  });

  it('global CLAUDE.md action unselects project and opens editor', async () => {
    useUiStore.setState({ selectedProjectSlug: '-home-user-alpha' });
    render(<CommandPalette />, { wrapper });
    act(() => {
      dispatchCtrlK();
    });
    const item = screen.getByText('Otwórz CLAUDE.md (globalny)');
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(useUiStore.getState().selectedProjectSlug).toBeNull();
    expect(useUiStore.getState().editorOpen).toBe(true);
  });
});
