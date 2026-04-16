import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, type StartedServer } from './helpers/start-server';

let server: StartedServer;
let authCookie = '';
let csrfCookie = '';

async function getAuthCookies(s: StartedServer) {
  const res = await fetch(`${s.baseUrl}/api/auth?k=${s.token}`, { redirect: 'manual' });
  const cookies = res.headers.getSetCookie();
  const auth = cookies.find((c) => c.startsWith('claude_ui_auth='))?.split(';', 1)[0] ?? '';
  const csrf = cookies.find((c) => c.startsWith('claude_ui_csrf='))?.split(';', 1)[0] ?? '';
  return {
    header: [auth, csrf].filter(Boolean).join('; '),
    csrfValue: csrf.split('=')[1] ?? '',
  };
}

beforeAll(async () => {
  server = await startServer();
  const { header, csrfValue } = await getAuthCookies(server);
  authCookie = header;
  csrfCookie = csrfValue;
}, 30_000);

afterAll(async () => {
  await server.stop();
});

function openWs(headers: Record<string, string>): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/pty`, {
    headers: {
      Origin: `http://127.0.0.1:${server.port}`,
      ...headers,
    },
  });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => {
      reject(new Error(`status ${res.statusCode}`));
    });
  });
}

async function waitMessage(ws: WebSocket, predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const handler = (buf: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {
        /* skip */
      }
    };
    ws.on('message', handler);
  });
}

describe('WS /api/ws/pty — upgrade security', () => {
  it('403 bez Origin', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/pty`);
    await expect(
      new Promise((_, reject) => {
        ws.once('unexpected-response', (_req, res) =>
          reject(new Error(`status ${res.statusCode}`)),
        );
        ws.once('open', () => reject(new Error('unexpected open')));
      }),
    ).rejects.toThrow(/403/);
  });

  it('403 dla złego Origin', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/pty`, {
      headers: { Origin: 'http://evil.com' },
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

  it('403 bez cookie (poprawny Origin, brak auth)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/ws/pty`, {
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

describe('WS /api/ws/pty — spawn + data + kill', () => {
  it('spawn, echo, exit', async () => {
    const ws = await openWs({ Cookie: authCookie });
    ws.send(
      JSON.stringify({
        type: 'spawn',
        csrf: csrfCookie,
        cwd: process.env['HOME'] ?? '/tmp',
        cols: 80,
        rows: 24,
        shell: '/bin/bash',
      }),
    );
    const spawned = await waitMessage(ws, (m) => m['type'] === 'spawned', 10_000);
    expect(spawned['pid']).toBeTypeOf('number');

    ws.send(JSON.stringify({ type: 'data', data: 'echo hello-from-test\n' }));
    // Accumulate data until we see the marker — xterm echoes each keystroke so
    // the payload arrives across several chunks.
    const buf: string[] = [];
    const out = await waitMessage(
      ws,
      (m) => {
        if (m['type'] === 'data' && typeof m['data'] === 'string') {
          buf.push(m['data'] as string);
        }
        return buf.join('').includes('hello-from-test');
      },
      10_000,
    );
    expect(out['type']).toBe('data');

    ws.send(JSON.stringify({ type: 'data', data: 'exit 0\n' }));
    const exit = await waitMessage(ws, (m) => m['type'] === 'exit', 10_000);
    expect(exit['exitCode']).toBe(0);
    ws.close();
  }, 30_000);

  it('odrzuca spawn bez CSRF', async () => {
    const ws = await openWs({ Cookie: authCookie });
    ws.send(
      JSON.stringify({
        type: 'spawn',
        csrf: 'wrong',
        cwd: process.env['HOME'] ?? '/tmp',
        cols: 80,
        rows: 24,
      }),
    );
    const err = await waitMessage(ws, (m) => m['type'] === 'error');
    expect(err['code']).toBe('csrf');
  }, 10_000);

  it('odrzuca cwd poza $HOME', async () => {
    const ws = await openWs({ Cookie: authCookie });
    ws.send(
      JSON.stringify({
        type: 'spawn',
        csrf: csrfCookie,
        cwd: '/etc',
        cols: 80,
        rows: 24,
      }),
    );
    const err = await waitMessage(ws, (m) => m['type'] === 'error');
    expect(err['code']).toMatch(/path|escape/);
    ws.close();
  }, 10_000);
});
