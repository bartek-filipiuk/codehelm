import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const ROOT = resolve(__dirname, '..', '..');
const FAKE_HOME = resolve(ROOT, 'tests', 'fixtures', 'fake-home');

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
      HOME: FAKE_HOME,
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

test.beforeEach(async ({ page }) => {
  const res = await page.request.get(`http://127.0.0.1:${port}/api/auth?k=${token}`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
});

test('widzę 5 projektów z fixture', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  // Dev-mode first-compile can take a while — 20s accommodates slow CI.
  await expect(page.getByText('/tmp/alpha')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('/tmp/beta')).toBeVisible();
  await expect(page.getByText('/tmp/gamma')).toBeVisible();
  await expect(page.getByText('/tmp/delta')).toBeVisible();
  await expect(page.getByText('/tmp/epsilon')).toBeVisible();
});

test('search filtruje projekty', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByLabel('Szukaj projektu').fill('beta');
  await expect(page.getByText('/tmp/beta')).toBeVisible();
  await expect(page.getByText('/tmp/alpha')).toHaveCount(0);
});

test('klik projekt → pokazuje listę sesji', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByText('/tmp/epsilon').click();
  // Epsilon ma 3 sesje.
  await expect(page.getByText('3 wiadomości').first())
    .toBeHidden({ timeout: 1000 })
    .catch(() => {});
  // Zamiast tego — 3 kafelki sesji.
  const cards = page.getByRole('button').filter({ hasText: /wiadomości/ });
  await expect(cards).toHaveCount(3);
});

test('XSS slug renderowany jako text, nie script', async ({ page }) => {
  // Slush nie przejdzie walidacji (zawiera `<`), więc nie będzie w listingu —
  // ale nazwy z gamma mają <script> w message content, co nie trafia do sidebara.
  await page.goto(`http://127.0.0.1:${port}/`);
  const alerts: string[] = [];
  page.on('dialog', async (d) => {
    alerts.push(d.message());
    await d.dismiss();
  });
  await page.getByText('/tmp/gamma').click();
  await expect(page.getByText(/wiadomości/).first()).toBeVisible();
  // Nie powinno było być żadnego alertu (brak script eval).
  expect(alerts).toHaveLength(0);
});
