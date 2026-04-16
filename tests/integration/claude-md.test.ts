import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startServer, type StartedServer } from './helpers/start-server';

function buildFakeHome() {
  const home = mkdtempSync(`${tmpdir()}/claude-ui-md-`);
  const pdir = `${home}/proj`;
  mkdirSync(pdir, { recursive: true });
  const slug = pdir.replace(/\//g, '-');
  const projectsDir = `${home}/.claude/projects/${slug}`;
  mkdirSync(projectsDir, { recursive: true });
  const sessionId = '00000000-0000-4000-8000-aaaaaaaaaaaa';
  writeFileSync(
    `${projectsDir}/${sessionId}.jsonl`,
    JSON.stringify({
      type: 'user',
      sessionId,
      uuid: 'u-1',
      timestamp: '2026-04-15T10:00:00.000Z',
      cwd: pdir,
      message: { role: 'user', content: 'hi' },
    }) + '\n',
  );
  return { home, pdir, slug };
}

let server: StartedServer;
let authCookie = '';
let csrfValue = '';
let fake: ReturnType<typeof buildFakeHome>;

beforeAll(async () => {
  fake = buildFakeHome();
  server = await startServer({ HOME: fake.home });
  const res = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, { redirect: 'manual' });
  const cookies = res.headers.getSetCookie();
  const auth = cookies.find((c) => c.startsWith('claude_ui_auth='))?.split(';', 1)[0] ?? '';
  const csrf = cookies.find((c) => c.startsWith('claude_ui_csrf='))?.split(';', 1)[0] ?? '';
  authCookie = [auth, csrf].filter(Boolean).join('; ');
  csrfValue = csrf.split('=')[1] ?? '';
  // warmup
  for (let i = 0; i < 10; i++) {
    const warm = await fetch(`${server.baseUrl}/api/claude-md`, {
      headers: { Cookie: authCookie },
    });
    if (warm.status === 200) break;
    await new Promise((r) => setTimeout(r, 300));
  }
}, 60_000);

afterAll(async () => {
  await server.stop();
});

const authHeaders = (extra: Record<string, string> = {}) => ({
  Cookie: authCookie,
  'x-csrf-token': csrfValue,
  'Content-Type': 'application/json',
  ...extra,
});

describe('GET /api/claude-md (global)', () => {
  it('zwraca pusty doc gdy brak pliku', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md`, { headers: { Cookie: authCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; kind: string; path: string };
    expect(body.kind).toBe('global');
    expect(body.content).toBe('');
  });

  it('401 bez cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md`);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/claude-md (global)', () => {
  it('tworzy plik, zwraca mtime', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: '# Global\n\nhello world\n' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mtime: string; size: number; writeKind: string };
    expect(body.writeKind).toBe('created');
    expect(body.size).toBeGreaterThan(0);
    // Verify on disk.
    const onDisk = readFileSync(`${fake.home}/.claude/CLAUDE.md`, 'utf8');
    expect(onDisk).toContain('hello world');
  });

  it('403 bez CSRF', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md`, {
      method: 'PUT',
      headers: { Cookie: authCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(403);
  });

  it('413 przy body > 1 MB (Content-Length short-circuit)', async () => {
    const big = 'x'.repeat(1_100_000);
    const res = await fetch(`${server.baseUrl}/api/claude-md`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: big }),
    });
    expect(res.status).toBe(413);
  });

  it('412 conflict przy starym If-Unmodified-Since', async () => {
    // First current write.
    const first = await fetch(`${server.baseUrl}/api/claude-md`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'v1' }),
    });
    expect(first.status).toBe(200);
    // Tick forward so mtime granularity doesn't swallow the difference.
    await new Promise((r) => setTimeout(r, 1100));
    // Update again on disk so the stale If-Unmodified-Since is actually stale.
    const second = await fetch(`${server.baseUrl}/api/claude-md`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'v2' }),
    });
    expect(second.status).toBe(200);

    const conflict = await fetch(`${server.baseUrl}/api/claude-md`, {
      method: 'PUT',
      headers: authHeaders({ 'If-Unmodified-Since': new Date(Date.now() - 60_000).toUTCString() }),
      body: JSON.stringify({ content: 'v3' }),
    });
    expect(conflict.status).toBe(412);
  });
});

describe('PUT /api/claude-md/[slug] (project)', () => {
  it('tworzy plik pod <project-cwd>/CLAUDE.md', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md/${fake.slug}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: '# Project CLAUDE.md\n' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toBe(`${fake.pdir}/CLAUDE.md`);
    const onDisk = readFileSync(`${fake.pdir}/CLAUDE.md`, 'utf8');
    expect(onDisk).toContain('Project CLAUDE.md');
  });

  it('400 dla invalid slug', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md/..evil`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 dla nieistniejącego projektu', async () => {
    const res = await fetch(`${server.baseUrl}/api/claude-md/-tmp-nope`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});
