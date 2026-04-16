import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { startServer, type StartedServer } from './helpers/start-server';

const FAKE_HOME = resolve(__dirname, '..', 'fixtures', 'fake-home');

let server: StartedServer;
let authCookies = '';

beforeAll(async () => {
  server = await startServer({ HOME: FAKE_HOME });
  const authRes = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, {
    redirect: 'manual',
  });
  authCookies = authRes.headers
    .getSetCookie()
    .map((c) => c.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}, 30_000);

afterAll(async () => {
  await server.stop();
});

describe('GET /api/projects', () => {
  it('401 bez auth cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects`);
    expect(res.status).toBe(401);
  });

  it('zwraca 5 projektów z fake-home', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects`, {
      headers: { Cookie: authCookies },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Array<{ slug: string }> };
    expect(body.projects).toHaveLength(5);
    const slugs = body.projects.map((p) => p.slug).sort();
    expect(slugs).toEqual([
      '-tmp-alpha',
      '-tmp-beta',
      '-tmp-delta',
      '-tmp-epsilon',
      '-tmp-gamma',
    ]);
  });

  it('response Cache-Control: no-store', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects`, {
      headers: { Cookie: authCookies },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/projects/[slug]/sessions', () => {
  it('zwraca sesje dla valid slug', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects/-tmp-epsilon/sessions`, {
      headers: { Cookie: authCookies },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: Array<{ id: string }> };
    expect(body.sessions).toHaveLength(3);
  });

  it('400 dla invalid slug (path traversal)', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects/..%2F..%2Fetc/sessions`, {
      headers: { Cookie: authCookies },
    });
    expect(res.status).toBe(400);
  });

  it('401 bez cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects/-tmp-epsilon/sessions`);
    expect(res.status).toBe(401);
  });

  it('dostarcza preview dla pierwszych 20 sesji', async () => {
    const res = await fetch(`${server.baseUrl}/api/projects/-tmp-alpha/sessions`, {
      headers: { Cookie: authCookies },
    });
    const body = (await res.json()) as {
      sessions: Array<{ messageCount: number | null; firstUserPreview: string | null }>;
    };
    const first = body.sessions[0];
    expect(first?.messageCount).not.toBeNull();
    expect(first?.firstUserPreview).not.toBeNull();
  });
});

describe('GET /api/sessions/[id]', () => {
  it('streamuje JSONL z Content-Type x-ndjson', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const res = await fetch(`${server.baseUrl}/api/sessions/${id}?slug=-tmp-alpha`, {
      headers: { Cookie: authCookies },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const body = await res.text();
    const lines = body.split('\n').filter(Boolean);
    // Fixture ma 10 poprawnych linii + 1 malformed — endpoint streamuje raw, bez filtracji.
    expect(lines.length).toBeGreaterThanOrEqual(10);
  });

  it('400 dla invalid slug', async () => {
    const res = await fetch(
      `${server.baseUrl}/api/sessions/00000000-0000-4000-8000-000000000001?slug=../evil`,
      { headers: { Cookie: authCookies } },
    );
    expect(res.status).toBe(400);
  });

  it('400 dla invalid sessionId', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/<script>?slug=-tmp-alpha`, {
      headers: { Cookie: authCookies },
    });
    expect(res.status).toBe(400);
  });

  it('404 dla nieistniejącego sessionId', async () => {
    const res = await fetch(
      `${server.baseUrl}/api/sessions/ffffffff-ffff-4fff-8fff-ffffffffffff?slug=-tmp-alpha`,
      { headers: { Cookie: authCookies } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions/[id]/export', () => {
  it('zwraca Markdown z Content-Disposition attachment', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const res = await fetch(`${server.baseUrl}/api/sessions/${id}/export?slug=-tmp-alpha`, {
      headers: { Cookie: authCookies },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain(`${id}.md`);
    const body = await res.text();
    expect(body).toContain(`# Claude Code session — ${id}`);
    expect(body).toContain('Hello there');
  });
});
