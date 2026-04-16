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

test('otwieram sesję → widzę wiadomości', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByText('/tmp/alpha').click();
  // First session tile, click it.
  await page
    .getByRole('button')
    .filter({ hasText: /wiadomości/ })
    .first()
    .click();
  // Expected: user "Hello there" from fixture.
  await expect(page.getByText('Hello there')).toBeVisible();
  // Assistant text from fixture.
  await expect(page.getByText('Hi, how can I help?')).toBeVisible();
  // Tool use Bash label.
  await expect(page.getByText('Bash')).toBeVisible();
});

test('XSS w assistant content nie odpala alert', async ({ page }) => {
  const alerts: string[] = [];
  page.on('dialog', async (d) => {
    alerts.push(d.message());
    await d.dismiss();
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByText('/tmp/gamma').click();
  await page
    .getByRole('button')
    .filter({ hasText: /wiadomości/ })
    .first()
    .click();
  // The raw markdown contains <script>alert(1)</script> inside backticks.
  await expect(page.getByText(/safe rendering/)).toBeVisible();
  expect(alerts).toHaveLength(0);
});

test('search w sesji podświetla i nawiguje', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByText('/tmp/alpha').click();
  await page
    .getByRole('button')
    .filter({ hasText: /wiadomości/ })
    .first()
    .click();
  const searchBox = page.getByLabel('Szukaj w sesji');
  await searchBox.fill('Hello');
  // counter shows "1/N".
  await expect(page.getByText(/^1\//)).toBeVisible();
});
