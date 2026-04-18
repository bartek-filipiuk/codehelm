import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startServer, type StartedServer } from './helpers/start-server';

let server: StartedServer;
let authCookie = '';
let csrfToken = '';
let fakeHome: string;

beforeAll(async () => {
  // Pre-resolve tmpdir symlinks (macOS: /var → /private/var) so that fake paths
  // match what server-side path-guard returns after its own realpath() pass.
  fakeHome = realpathSync(mkdtempSync(`${tmpdir()}/codehelm-settings-api-`));
  mkdirSync(`${fakeHome}/.codehelm`, { recursive: true });
  server = await startServer({ HOME: fakeHome });
  const res = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, { redirect: 'manual' });
  const cookies = res.headers.getSetCookie();
  const auth = cookies.find((c) => c.startsWith('codehelm_auth='))?.split(';', 1)[0] ?? '';
  const csrf = cookies.find((c) => c.startsWith('codehelm_csrf='))?.split(';', 1)[0] ?? '';
  authCookie = [auth, csrf].filter(Boolean).join('; ');
  csrfToken = csrf.split('=')[1] ?? '';
}, 30_000);

afterAll(async () => {
  await server.stop();
});

describe('GET /api/settings', () => {
  it('returns defaults when no settings file exists', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      headers: { Cookie: authCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: Record<string, unknown> };
    expect(body.settings['viewerFontSize']).toBe('md');
    expect(body.settings['terminalFontSize']).toBe(13);
    expect(body.settings['viewerDensity']).toBe('comfortable');
    expect(body.settings['theme']).toBe('dark');
  });

  it('401 without auth', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`);
    expect(res.status).toBe(401);
  });

  it('Cache-Control: no-store', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      headers: { Cookie: authCookie },
    });
    // Next.js 15 appends `must-revalidate` to `no-store` for dynamic routes.
    expect(res.headers.get('cache-control')).toMatch(/^no-store(,.*)?$/);
  });
});

describe('PATCH /api/settings', () => {
  it('persists a partial patch and returns merged settings', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ theme: 'darker', viewerFontSize: 'lg' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: Record<string, unknown> };
    expect(body.settings['theme']).toBe('darker');
    expect(body.settings['viewerFontSize']).toBe('lg');
    // Untouched fields keep their previous values.
    expect(body.settings['terminalFontSize']).toBe(13);

    // Subsequent GET reflects the patch.
    const after = await fetch(`${server.baseUrl}/api/settings`, {
      headers: { Cookie: authCookie },
    });
    const stored = (await after.json()) as { settings: Record<string, unknown> };
    expect(stored.settings['theme']).toBe('darker');
    expect(stored.settings['viewerFontSize']).toBe('lg');
  });

  it('400 for invalid enum value', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ theme: 'mauve' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 for empty patch', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('403 without CSRF header', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: authCookie },
      body: JSON.stringify({ theme: 'dark' }),
    });
    expect(res.status).toBe(403);
  });

  it('401 without auth cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ theme: 'dark' }),
    });
    expect(res.status).toBe(401);
  });
});
