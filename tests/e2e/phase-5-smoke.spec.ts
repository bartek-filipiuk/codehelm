import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

function buildFakeHome() {
  const home = mkdtempSync(`${tmpdir()}/claude-ui-phase5-`);
  // Hex-only session IDs — lib/jsonl/index accepts only canonical UUID shape.
  const ids = {
    alpha: '00000000-0000-4000-8000-aaaaaaaaaaaa',
    beta: '11111111-0000-4000-8000-bbbbbbbbbbbb',
    gamma: '22222222-0000-4000-8000-cccccccccccc',
  } as const;
  const make = (name: keyof typeof ids) => {
    const pdir = `${home}/${name}`;
    mkdirSync(pdir, { recursive: true });
    const slug = pdir.replace(/\//g, '-');
    const pdirSession = `${home}/.claude/projects/${slug}`;
    mkdirSync(pdirSession, { recursive: true });
    const sessionId = ids[name];
    writeFileSync(
      `${pdirSession}/${sessionId}.jsonl`,
      JSON.stringify({
        type: 'user',
        sessionId,
        uuid: 'u-1',
        timestamp: '2026-04-15T10:00:00.000Z',
        cwd: pdir,
        message: { role: 'user', content: `fixture for ${name}` },
      }) + '\n',
    );
    return { cwd: pdir, sessionId };
  };
  return {
    home,
    alpha: make('alpha'),
    beta: make('beta'),
    gamma: make('gamma'),
  };
}

let port: number;
let token: string;
let server: ChildProcess;
let fake: ReturnType<typeof buildFakeHome>;

test.beforeAll(async () => {
  port = await pickPort();
  token = randomBytes(32).toString('hex');
  fake = buildFakeHome();
  server = spawn('pnpm', ['exec', 'tsx', 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      CLAUDE_UI_TOKEN: token,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      HOME: fake.home,
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

test('3 zakładki shella, przełączanie, zamknięcie', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);

  // Wait until the project list renders — it contains buttons with "/alpha"
  // substring. With a mutable tmpdir HOME the exact displayed path depends
  // on whether resolvedCwd was sniffed; we match just the trailing segment.
  await expect(page.locator('aside button').filter({ hasText: /alpha/ }).first()).toBeVisible({
    timeout: 15_000,
  });

  const newShell = page.getByRole('button', { name: '+ shell' });
  const clickProject = (name: string) =>
    page
      .locator('aside button')
      .filter({ hasText: new RegExp(name) })
      .first()
      .click();

  await clickProject('alpha');
  await newShell.click();
  await expect(page.getByText('ready').first()).toBeVisible({ timeout: 10_000 });

  await clickProject('beta');
  await newShell.click();
  await expect(page.getByRole('tab')).toHaveCount(2);

  await clickProject('gamma');
  await newShell.click();
  await expect(page.getByRole('tab')).toHaveCount(3);

  // Tab header shows counter 3/16.
  await expect(page.getByText(/Terminal · 3\/16/)).toBeVisible();

  // Click first tab, check active state.
  const tabs = page.getByRole('tab');
  await tabs.nth(0).click();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');

  // Close middle tab via × button.
  await tabs.nth(1).getByRole('button', { name: 'Zamknij zakładkę' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
});
