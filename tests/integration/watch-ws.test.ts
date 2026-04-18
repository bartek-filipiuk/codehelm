import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startServer, type StartedServer } from './helpers/start-server';

function buildFakeHome() {
  // Pre-resolve tmpdir symlinks (macOS: /var → /private/var) so that fake paths
  // match what server-side path-guard returns after its own realpath() pass.
  const home = realpathSync(mkdtempSync(`${tmpdir()}/codehelm-watch-`));
  mkdirSync(`${home}/.claude/projects`, { recursive: true });
  return home;
}

let server: StartedServer;
let home: string;
let authCookie = '';

async function authHeader(s: StartedServer): Promise<string> {
  const res = await fetch(`${s.baseUrl}/api/auth?k=${s.token}`, { redirect: 'manual' });
  const cookies = res.headers.getSetCookie();
  return cookies.map((c) => c.split(';', 1)[0]).join('; ');
}

beforeAll(async () => {
  home = buildFakeHome();
  server = await startServer({ HOME: home });
  authCookie = await authHeader(server);
}, 30_000);

afterAll(async () => {
  await server.stop();
});

function openWatch(headers: Record<string, string> = {}): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/watch`, {
    headers: { Origin: `http://127.0.0.1:${server.port}`, ...headers },
  });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => reject(new Error(`status ${res.statusCode}`)));
  });
}

function collectEvents(ws: WebSocket, ms: number): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve) => {
    const acc: Array<Record<string, unknown>> = [];
    const handler = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        if (parsed['type'] === 'events' && Array.isArray(parsed['events'])) {
          for (const e of parsed['events'] as Array<Record<string, unknown>>) acc.push(e);
        }
      } catch {
        /* skip */
      }
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.off('message', handler);
      resolve(acc);
    }, ms);
  });
}

describe('WS /api/ws/watch — upgrade security', () => {
  it('403 without Origin', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/watch`);
    await expect(
      new Promise((_, reject) => {
        ws.once('unexpected-response', (_req, res) =>
          reject(new Error(`status ${res.statusCode}`)),
        );
        ws.once('open', () => reject(new Error('unexpected open')));
      }),
    ).rejects.toThrow(/403/);
  });

  it('403 without cookie', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/watch`, {
      headers: { Origin: `http://127.0.0.1:${server.port}` },
    });
    await expect(
      new Promise((_, reject) => {
        ws.once('unexpected-response', (_req, res) =>
          reject(new Error(`status ${res.statusCode}`)),
        );
        ws.once('open', () => reject(new Error('unexpected open')));
      }),
    ).rejects.toThrow(/403/);
  });
});

describe('WS /api/ws/watch — events', () => {
  it('emits session-added after a .jsonl file appears', async () => {
    const ws = await openWatch({ Cookie: authCookie });
    // Give the watcher a moment to boot.
    await new Promise((r) => setTimeout(r, 200));

    const slug = '-tmp-watch-alpha';
    const dir = `${home}/.claude/projects/${slug}`;
    mkdirSync(dir, { recursive: true });
    const sessionId = '00000000-0000-4000-8000-aaaaaaaaaaaa';
    writeFileSync(
      `${dir}/${sessionId}.jsonl`,
      JSON.stringify({
        type: 'user',
        sessionId,
        uuid: 'u-1',
        timestamp: '2026-04-15T10:00:00.000Z',
        cwd: `${home}/alpha`,
        message: { role: 'user', content: 'hi' },
      }) + '\n',
    );

    const events = await collectEvents(ws, 800);
    const added = events.find((e) => e['kind'] === 'session-added' && e['sessionId'] === sessionId);
    expect(added).toBeDefined();
    ws.close();
  }, 15_000);

  it('emits session-updated after appends to an existing file (debounced)', async () => {
    const slug = '-tmp-watch-beta';
    const dir = `${home}/.claude/projects/${slug}`;
    mkdirSync(dir, { recursive: true });
    const sessionId = '11111111-0000-4000-8000-bbbbbbbbbbbb';
    const file = `${dir}/${sessionId}.jsonl`;
    writeFileSync(
      file,
      JSON.stringify({
        type: 'user',
        sessionId,
        message: { role: 'user', content: 'hi' },
      }) + '\n',
    );

    // Let the watcher register the new file.
    await new Promise((r) => setTimeout(r, 300));

    const ws = await openWatch({ Cookie: authCookie });
    await new Promise((r) => setTimeout(r, 200));

    // Three rapid appends — debounce should coalesce to exactly one event.
    for (let i = 0; i < 3; i++) {
      appendFileSync(
        file,
        JSON.stringify({
          type: 'user',
          sessionId,
          message: { role: 'user', content: `msg ${i}` },
        }) + '\n',
      );
      await new Promise((r) => setTimeout(r, 30));
    }

    const events = await collectEvents(ws, 1000);
    const updates = events.filter(
      (e) => e['kind'] === 'session-updated' && e['sessionId'] === sessionId,
    );
    expect(updates.length).toBeGreaterThanOrEqual(1);
    // Coalesced: 3 appends shouldn't produce more than ~2 updates after 200ms debounce.
    expect(updates.length).toBeLessThanOrEqual(2);
    ws.close();
  }, 15_000);

  it('never emits events outside the projects dir (symlink-escape safety)', async () => {
    const ws = await openWatch({ Cookie: authCookie });
    await new Promise((r) => setTimeout(r, 200));

    // A file added OUTSIDE ~/.claude/projects/ should never surface.
    const outside = `${home}/outside.txt`;
    writeFileSync(outside, 'nope');

    const events = await collectEvents(ws, 500);
    expect(events.every((e) => e['slug'])).toBe(true);
    ws.close();
  }, 10_000);
});
