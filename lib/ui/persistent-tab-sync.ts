export interface ServerPersistentTab {
  persistentId: string;
  title: string;
  cwd: string;
  shell?: string;
  args?: string[];
  initCommand?: string;
  cronTag?: string;
  projectSlug?: string;
  aliasKey?: string;
  createdAt: number;
  updatedAt: number;
  alive: boolean;
  ptyId: string | null;
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

function csrfHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': readCookie('codehelm_csrf'),
  };
}

export interface RegisterInput {
  title: string;
  cwd: string;
  shell?: string;
  initCommand?: string;
  projectSlug?: string;
  aliasKey?: string;
}

export async function registerPersistentTab(
  input: RegisterInput,
): Promise<ServerPersistentTab | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/persistent-tabs', {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrfHeaders(),
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tab?: ServerPersistentTab };
    return body.tab ?? null;
  } catch {
    return null;
  }
}

export async function fetchPersistentTabs(): Promise<ServerPersistentTab[]> {
  if (typeof fetch !== 'function') return [];
  try {
    const res = await fetch('/api/persistent-tabs', { credentials: 'same-origin' });
    if (!res.ok) return [];
    const body = (await res.json()) as { tabs: ServerPersistentTab[] };
    return body.tabs ?? [];
  } catch {
    return [];
  }
}

export function deletePersistentTab(persistentId: string): void {
  if (typeof fetch !== 'function') return;
  // Fire-and-forget: the user already decided to close the tab.
  void fetch(`/api/persistent-tabs/${persistentId}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: csrfHeaders(),
  }).catch(() => undefined);
}

/** Persists a tab rename server-side so the new title survives reloads on
 * any browser that reads the same ~/.codehelm. Fire-and-forget — the UI has
 * already updated Zustand synchronously. */
export function renamePersistentTab(persistentId: string, title: string): void {
  if (typeof fetch !== 'function') return;
  void fetch(`/api/persistent-tabs/${persistentId}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: csrfHeaders(),
    body: JSON.stringify({ title }),
  }).catch(() => undefined);
}

/** Asks the server to kill the backing PTY and spawn a fresh one with the
 * tab's stored shell/args/initCommand. Same persistentId, brand-new process —
 * lets the RESTART button do a real restart for `claude --resume X` and
 * other long-running TUIs instead of just reattaching to the same session. */
export async function respawnPersistentTabRequest(persistentId: string): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  try {
    const res = await fetch(`/api/persistent-tabs/${persistentId}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrfHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
