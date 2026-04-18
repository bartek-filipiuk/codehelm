import type { TerminalLayout } from '@/stores/terminal-slice';

const KEY = 'codehelm:pane-sizes';

type Store = Partial<Record<TerminalLayout, number[]>>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function loadPaneSizes(layout: TerminalLayout): number[] | null {
  const s = read();
  const v = s[layout];
  if (!Array.isArray(v)) return null;
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;
  return v;
}

export function savePaneSizes(layout: TerminalLayout, sizes: number[]): void {
  if (typeof window === 'undefined') return;
  const s = read();
  s[layout] = sizes;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded — not fatal, panes fall back to defaults next load.
  }
}
