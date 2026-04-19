'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as RKeyboardEvent,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';

import { LAYOUT_STORAGE_KEY, loadLayout, patchLayout } from '@/lib/ui/layout-storage';
import { useUiStore } from '@/stores/ui-slice';

export { LAYOUT_STORAGE_KEY };
export const MIN_SIDEBAR = 200;
export const MIN_SESSIONS = 240;
export const MIN_VIEWER = 400;
export const DEFAULT_SIDEBAR = 320;
export const DEFAULT_SESSIONS = 320;
const KEY_STEP = 16;
const SPLITTER_PX = 4;

export interface LayoutWidths {
  sidebar: number;
  sessions: number;
}

export function clampWidths(w: LayoutWidths, viewport: number): LayoutWidths {
  const splitters = SPLITTER_PX * 2;
  const maxSidebar = Math.max(MIN_SIDEBAR, viewport - splitters - MIN_SESSIONS - MIN_VIEWER);
  const sidebar = Math.min(Math.max(MIN_SIDEBAR, w.sidebar), maxSidebar);
  const maxSessions = Math.max(MIN_SESSIONS, viewport - splitters - sidebar - MIN_VIEWER);
  const sessions = Math.min(Math.max(MIN_SESSIONS, w.sessions), maxSessions);
  return { sidebar, sessions };
}

export function loadWidths(): LayoutWidths {
  const defaults: LayoutWidths = { sidebar: DEFAULT_SIDEBAR, sessions: DEFAULT_SESSIONS };
  const stored = loadLayout();
  return {
    sidebar: Number.isFinite(stored.sidebar) ? (stored.sidebar as number) : defaults.sidebar,
    sessions: Number.isFinite(stored.sessions) ? (stored.sessions as number) : defaults.sessions,
  };
}

function saveWidths(w: LayoutWidths): void {
  patchLayout({ sidebar: w.sidebar, sessions: w.sessions });
}

interface ResizableColumnsProps {
  sidebar: ReactNode;
  sessions: ReactNode;
  viewer: ReactNode;
}

export function ResizableColumns({ sidebar, sessions, viewer }: ResizableColumnsProps) {
  const [widths, setWidths] = useState<LayoutWidths>({
    sidebar: DEFAULT_SIDEBAR,
    sessions: DEFAULT_SESSIONS,
  });
  const [hydrated, setHydrated] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const focusMode = useUiStore((s) => s.focusMode);

  useEffect(() => {
    const rawVp = containerRef.current?.clientWidth ?? 0;
    const vp = rawVp > 0 ? rawVp : window.innerWidth;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate localStorage post-mount to avoid SSR/CSR mismatch
    setWidths(clampWidths(loadWidths(), vp));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWidths(widths);
  }, [widths, hydrated]);

  const viewport = useCallback(() => {
    const raw = containerRef.current?.clientWidth ?? 0;
    if (raw > 0) return raw;
    return typeof window === 'undefined' ? 1600 : window.innerWidth;
  }, []);

  const startDrag = useCallback(
    (which: keyof LayoutWidths) => (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startSidebar = widths.sidebar;
      const startSessions = widths.sessions;
      const vp = viewport();
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const next: LayoutWidths =
          which === 'sidebar'
            ? { sidebar: startSidebar + dx, sessions: startSessions }
            : { sidebar: startSidebar, sessions: startSessions + dx };
        setWidths(clampWidths(next, vp));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths, viewport],
  );

  const onKey = useCallback(
    (which: keyof LayoutWidths) => (e: RKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP;
      setWidths((prev) =>
        clampWidths(
          which === 'sidebar'
            ? { sidebar: prev.sidebar + delta, sessions: prev.sessions }
            : { sidebar: prev.sidebar, sessions: prev.sessions + delta },
          viewport(),
        ),
      );
    },
    [viewport],
  );

  const onDoubleClick = useCallback(() => {
    setWidths(clampWidths({ sidebar: DEFAULT_SIDEBAR, sessions: DEFAULT_SESSIONS }, viewport()));
  }, [viewport]);

  const gridTemplate = focusMode
    ? 'minmax(0, 1fr)'
    : `${widths.sidebar}px ${SPLITTER_PX}px ${widths.sessions}px ${SPLITTER_PX}px minmax(0, 1fr)`;
  const sideWrapStyle: CSSProperties = focusMode
    ? { display: 'none' }
    : { display: 'contents' };
  const splitterStyle: CSSProperties = focusMode ? { display: 'none' } : {};

  return (
    <div
      ref={containerRef}
      className="grid h-screen text-[color:var(--fg-0)]"
      style={{ gridTemplateColumns: gridTemplate, background: 'var(--bg-0)' }}
      data-testid="resizable-columns"
      data-focus-mode={focusMode || undefined}
    >
      <div
        style={sideWrapStyle}
        aria-hidden={focusMode || undefined}
        data-testid="column-sidebar"
      >
        {sidebar}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={MIN_SIDEBAR}
        aria-valuenow={widths.sidebar}
        aria-hidden={focusMode || undefined}
        tabIndex={focusMode ? -1 : 0}
        onPointerDown={startDrag('sidebar')}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKey('sidebar')}
        data-testid="splitter-sidebar"
        className="cursor-col-resize touch-none bg-[var(--line)] transition-colors hover:bg-[var(--line-3)] focus:bg-[var(--gold-700)] focus:outline-none"
        style={splitterStyle}
      />
      <div
        style={sideWrapStyle}
        aria-hidden={focusMode || undefined}
        data-testid="column-sessions"
      >
        {sessions}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize session list"
        aria-valuemin={MIN_SESSIONS}
        aria-valuenow={widths.sessions}
        aria-hidden={focusMode || undefined}
        tabIndex={focusMode ? -1 : 0}
        onPointerDown={startDrag('sessions')}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKey('sessions')}
        data-testid="splitter-sessions"
        className="cursor-col-resize touch-none bg-[var(--line)] transition-colors hover:bg-[var(--line-3)] focus:bg-[var(--gold-700)] focus:outline-none"
        style={splitterStyle}
      />
      {viewer}
    </div>
  );
}
