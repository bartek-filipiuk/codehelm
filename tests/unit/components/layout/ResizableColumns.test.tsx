import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DEFAULT_SESSIONS,
  DEFAULT_SIDEBAR,
  LAYOUT_STORAGE_KEY,
  MIN_SESSIONS,
  MIN_SIDEBAR,
  MIN_VIEWER,
  ResizableColumns,
  clampWidths,
  loadWidths,
} from '@/components/layout/ResizableColumns';

function renderLayout() {
  return render(
    <ResizableColumns
      sidebar={<div data-testid="slot-sidebar">S</div>}
      sessions={<div data-testid="slot-sessions">M</div>}
      viewer={<div data-testid="slot-viewer">V</div>}
    />,
  );
}

function getTemplate(): string {
  const el = screen.getByTestId('resizable-columns') as HTMLElement;
  return el.style.gridTemplateColumns;
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('clampWidths', () => {
  it('wymusza minima', () => {
    const w = clampWidths({ sidebar: 50, sessions: 50 }, 1600);
    expect(w.sidebar).toBe(MIN_SIDEBAR);
    expect(w.sessions).toBe(MIN_SESSIONS);
  });

  it('does not let the viewer lose its minimum space', () => {
    // viewport = 1000, splitters = 8, sidebar wants 800 -> clamped so viewer >= 400
    const w = clampWidths({ sidebar: 800, sessions: 240 }, 1000);
    expect(w.sidebar).toBeLessThanOrEqual(1000 - 8 - MIN_SESSIONS - MIN_VIEWER);
    expect(w.sidebar).toBeGreaterThanOrEqual(MIN_SIDEBAR);
  });

  it('keeps sensible widths on a wide viewport', () => {
    const w = clampWidths({ sidebar: 400, sessions: 360 }, 1920);
    expect(w.sidebar).toBe(400);
    expect(w.sessions).toBe(360);
  });
});

describe('loadWidths', () => {
  it('zwraca defaults gdy brak wpisu', () => {
    expect(loadWidths()).toEqual({ sidebar: DEFAULT_SIDEBAR, sessions: DEFAULT_SESSIONS });
  });

  it('odczytuje z localStorage pod kluczem claude-ui:layout', () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ sidebar: 500, sessions: 300 }),
    );
    expect(loadWidths()).toEqual({ sidebar: 500, sessions: 300 });
  });

  it('odrzuca malformed JSON', () => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{broken');
    expect(loadWidths()).toEqual({ sidebar: DEFAULT_SIDEBAR, sessions: DEFAULT_SESSIONS });
  });

  it('rejects non-numeric values', () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ sidebar: 'abc', sessions: null }),
    );
    expect(loadWidths()).toEqual({ sidebar: DEFAULT_SIDEBAR, sessions: DEFAULT_SESSIONS });
  });
});

describe('<ResizableColumns />', () => {
  it('renderuje trzy sloty i dwa splittery', () => {
    renderLayout();
    expect(screen.getByTestId('slot-sidebar')).toBeTruthy();
    expect(screen.getByTestId('slot-sessions')).toBeTruthy();
    expect(screen.getByTestId('slot-viewer')).toBeTruthy();
    expect(screen.getAllByRole('separator', { hidden: false })).toHaveLength(2);
  });

  it('startuje od defaults gdy localStorage pusty', () => {
    renderLayout();
    const template = getTemplate();
    expect(template).toContain(`${DEFAULT_SIDEBAR}px`);
    expect(template).toContain(`${DEFAULT_SESSIONS}px`);
  });

  it('hydrates widths from localStorage', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ sidebar: 420, sessions: 280 }),
    );
    renderLayout();
    // After the effect runs the grid template reflects stored widths.
    await act(async () => {});
    const template = getTemplate();
    expect(template).toContain('420px');
    expect(template).toContain('280px');
  });

  it('persists new widths to localStorage under claude-ui:layout', async () => {
    renderLayout();
    await act(async () => {});
    const splitter = screen.getByTestId('splitter-sidebar');
    await act(async () => {
      fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    });
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { sidebar: number; sessions: number };
    expect(parsed.sidebar).toBeGreaterThan(DEFAULT_SIDEBAR);
  });

  it('ArrowLeft / ArrowRight resizes the sidebar', async () => {
    renderLayout();
    await act(async () => {});
    const splitter = screen.getByTestId('splitter-sidebar');
    await act(async () => {
      fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    });
    expect(getTemplate()).toContain(`${DEFAULT_SIDEBAR + 16}px`);
    await act(async () => {
      fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
      fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    });
    expect(getTemplate()).toContain(`${DEFAULT_SIDEBAR - 16}px`);
  });

  it('ArrowRight on the sessions splitter resizes the session list', async () => {
    renderLayout();
    await act(async () => {});
    const splitter = screen.getByTestId('splitter-sessions');
    await act(async () => {
      fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    });
    expect(getTemplate()).toContain(`${DEFAULT_SESSIONS + 16}px`);
  });

  it('ArrowLeft does not drop below MIN_SIDEBAR', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ sidebar: MIN_SIDEBAR, sessions: MIN_SESSIONS }),
    );
    renderLayout();
    await act(async () => {});
    const splitter = screen.getByTestId('splitter-sidebar');
    await act(async () => {
      for (let i = 0; i < 5; i++) fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    });
    expect(getTemplate()).toContain(`${MIN_SIDEBAR}px`);
  });

  it('double-click resets widths to defaults', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ sidebar: 500, sessions: 400 }),
    );
    renderLayout();
    await act(async () => {});
    const splitter = screen.getByTestId('splitter-sidebar');
    await act(async () => {
      fireEvent.doubleClick(splitter);
    });
    const template = getTemplate();
    expect(template).toContain(`${DEFAULT_SIDEBAR}px`);
    expect(template).toContain(`${DEFAULT_SESSIONS}px`);
  });

  it('splitters have role=separator and English aria-labels', () => {
    renderLayout();
    const separators = screen.getAllByRole('separator');
    expect(separators.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Resize sidebar',
      'Resize session list',
    ]);
    for (const s of separators) {
      expect(s.getAttribute('aria-orientation')).toBe('vertical');
      expect(s.tabIndex).toBe(0);
    }
  });
});
