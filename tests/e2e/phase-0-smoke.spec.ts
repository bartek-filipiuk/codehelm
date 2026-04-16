import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const ROOT = resolve(__dirname, '..', '..');

function pickPort(): Promise<number> {
  return new Promise((resolveFn, rejectFn) => {
    const s = createServer();
    s.once('error', rejectFn);
    s.listen({ port: 0, host: '127.0.0.1' }, () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        s.close(() => resolveFn(port));
      } else {
        s.close(() => rejectFn(new Error('cannot obtain port')));
      }
    });
  });
}

function waitHealth(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveFn, rejectFn) => {
    const tick = () => {
      if (Date.now() > deadline) {
        rejectFn(new Error('health timeout'));
        return;
      }
      const req = request(
        { host: '127.0.0.1', port, path: '/api/healthz', method: 'GET' },
        (res) => {
          if (res.statusCode === 200) {
            res.resume();
            resolveFn();
          } else {
            res.resume();
            setTimeout(tick, 150);
          }
        },
      );
      req.once('error', () => setTimeout(tick, 150));
      req.setTimeout(500, () => req.destroy());
      req.end();
    };
    tick();
  });
}

let port: number;
let token: string;
let server: ChildProcess;

test.beforeAll(async () => {
  port = await pickPort();
  token = randomBytes(32).toString('hex');
  server = spawn('pnpm', ['exec', 'tsx', 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      CLAUDE_UI_TOKEN: token,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitHealth(port);
});

test.afterAll(async () => {
  server?.kill('SIGTERM');
  await new Promise<void>((r) => {
    server?.once('exit', () => r());
    setTimeout(r, 3000).unref();
  });
});

test('placeholder strona widoczna po auth', async ({ page, context }) => {
  // Seed auth cookie via APIRequest (follows redirect, stores cookie in context).
  const authRes = await page.request.get(`http://127.0.0.1:${port}/api/auth?k=${token}`, {
    maxRedirects: 0,
  });
  expect(authRes.status()).toBe(200);

  const cookies = await context.cookies();
  const hasAuth = cookies.some((c) => c.name === 'claude_ui_auth');
  expect(hasAuth).toBe(true);

  const resp = await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByRole('heading', { name: 'claude-ui' })).toBeVisible();

  // CSP w response header — ustawiany per-request przez middleware.
  const csp = resp?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src/);
  const scriptSrcLine = csp.match(/script-src[^;]*/)?.[0] ?? '';
  expect(scriptSrcLine).not.toContain('unsafe-inline');
  expect(csp).toContain("object-src 'none'");
});

test('Host: evil.com → 403', async ({ request: apiReq }) => {
  const res = await apiReq.get(`http://127.0.0.1:${port}/api/healthz`, {
    headers: { Host: 'evil.com' },
  });
  expect(res.status()).toBe(403);
});

test('bez cookie → 401 na / (auth wymagany)', async ({ request: apiReq }) => {
  const res = await apiReq.get(`http://127.0.0.1:${port}/`);
  expect(res.status()).toBe(401);
});

test('Referrer-Policy: no-referrer', async ({ request: apiReq }) => {
  const res = await apiReq.get(`http://127.0.0.1:${port}/api/healthz`);
  expect(res.headers()['referrer-policy']).toBe('no-referrer');
});
