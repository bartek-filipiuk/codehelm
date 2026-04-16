import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
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

/**
 * Phase-4 fixture needs a real project dir under $HOME with a JSONL that
 * declares cwd = <that dir>. We build it in a tmp HOME so the Terminal can
 * actually spawn $SHELL there (unlike /tmp/alpha in the shared fixture).
 */
function buildFakeHome() {
  const home = mkdtempSync(`${tmpdir()}/claude-ui-phase4-`);
  const projectDir = `${home}/proj`;
  mkdirSync(projectDir, { recursive: true });
  const slug = projectDir.replace(/\//g, '-');
  const projectsDir = `${home}/.claude/projects/${slug}`;
  mkdirSync(projectsDir, { recursive: true });
  const sessionId = '00000000-0000-4000-8000-0000000000ab';
  const jsonl =
    JSON.stringify({
      type: 'user',
      sessionId,
      uuid: 'u-1',
      timestamp: '2026-04-15T10:00:00.000Z',
      cwd: projectDir,
      message: { role: 'user', content: 'phase 4 fixture' },
    }) + '\n';
  writeFileSync(`${projectsDir}/${sessionId}.jsonl`, jsonl);
  return { home, projectDir };
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

test('otwieram terminal → widzę output shella', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('aside button').filter({ hasText: /proj/ }).first().click();
  await page.getByRole('button', { name: '+ shell' }).click();
  await expect(page.getByText('ready').first()).toBeVisible({ timeout: 10_000 });

  const host = page.locator('.xterm').first();
  await host.click();
  await page.keyboard.type('echo hello-from-playwright\n');
  await expect(page.locator('.xterm-rows')).toContainText('hello-from-playwright', {
    timeout: 10_000,
  });
});

test('zamknięcie terminala przywraca viewer', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('aside button').filter({ hasText: /proj/ }).first().click();
  await page.getByRole('button', { name: '+ shell' }).click();
  await expect(page.getByText('ready').first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Pokaż historię' }).click();
  await expect(page.getByRole('heading', { name: 'Historia' })).toBeVisible();
});
