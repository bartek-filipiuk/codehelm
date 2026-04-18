import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startServer, type StartedServer } from './helpers/start-server';

/**
 * We need a project dir actually under the server's HOME because the
 * endpoint enforces assertInside($HOME, resolvedCwd). Build a tmp HOME with
 * one project whose JSONL cwd points back into it, then point the server at
 * that HOME.
 */
function buildFakeHome() {
  // Pre-resolve tmpdir symlinks (macOS: /var → /private/var) so that fake paths
  // match what server-side path-guard returns after its own realpath() pass.
  const home = realpathSync(mkdtempSync(`${tmpdir()}/codehelm-new-session-`));
  const projectDir = `${home}/proj`;
  mkdirSync(projectDir, { recursive: true });
  const slug = projectDir.replace(/\//g, '-');
  const projectsDir = `${home}/.claude/projects/${slug}`;
  mkdirSync(projectsDir, { recursive: true });
  const sessionId = '00000000-0000-4000-8000-000000000abc';
  const jsonl =
    JSON.stringify({
      type: 'user',
      sessionId,
      uuid: 'u-1',
      timestamp: '2026-04-15T10:00:00.000Z',
      cwd: projectDir,
      message: { role: 'user', content: 'hello' },
    }) + '\n';
  writeFileSync(`${projectsDir}/${sessionId}.jsonl`, jsonl);
  return { home, slug, sessionId };
}

let server: StartedServer;
let authCookie = '';
let csrfCookie = '';
let fake: ReturnType<typeof buildFakeHome>;

beforeAll(async () => {
  fake = buildFakeHome();
  server = await startServer({ HOME: fake.home });
  const res = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, { redirect: 'manual' });
  const cookies = res.headers.getSetCookie();
  const auth = cookies.find((c) => c.startsWith('codehelm_auth='))?.split(';', 1)[0] ?? '';
  const csrf = cookies.find((c) => c.startsWith('codehelm_csrf='))?.split(';', 1)[0] ?? '';
  authCookie = [auth, csrf].filter(Boolean).join('; ');
  csrfCookie = csrf.split('=')[1] ?? '';
}, 30_000);

afterAll(async () => {
  await server.stop();
});

describe('POST /api/sessions/new', () => {
  it('sukces — zwraca safe cwd + args', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfCookie,
      },
      body: JSON.stringify({ slug: fake.slug }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cwd: string;
      command: string;
      args: string[];
    };
    expect(body.command).toBe('claude');
    expect(body.args).toEqual([]);
    expect(body.cwd).toBe(`${fake.home}/proj`);
  });

  it('resumeSessionId zwraca args --resume <id>', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfCookie,
      },
      body: JSON.stringify({ slug: fake.slug, resumeSessionId: fake.sessionId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { args: string[] };
    expect(body.args).toEqual(['--resume', fake.sessionId]);
  });

  it('403 bez CSRF header', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: authCookie },
      body: JSON.stringify({ slug: fake.slug }),
    });
    expect(res.status).toBe(403);
  });

  it('401 bez auth cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfCookie },
      body: JSON.stringify({ slug: fake.slug }),
    });
    expect(res.status).toBe(401);
  });

  it('400 dla invalid slug (path traversal)', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfCookie,
      },
      body: JSON.stringify({ slug: '../etc' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 dla nieznanego slug', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfCookie,
      },
      body: JSON.stringify({ slug: '-tmp-nope-404' }),
    });
    expect(res.status).toBe(404);
  });

  it('400 dla bad body', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'x-csrf-token': csrfCookie,
      },
      body: '{malformed',
    });
    expect(res.status).toBe(400);
  });
});
