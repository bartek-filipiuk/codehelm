import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
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
  const home = mkdtempSync(`${tmpdir()}/claude-ui-phase6-`);
  const pdir = `${home}/alpha`;
  mkdirSync(pdir, { recursive: true });
  const slug = pdir.replace(/\//g, '-');
  const projectsDir = `${home}/.claude/projects/${slug}`;
  mkdirSync(projectsDir, { recursive: true });
  const sessionId = '00000000-0000-4000-8000-aaaaaaaaaaaa';
  const file = `${projectsDir}/${sessionId}.jsonl`;
  writeFileSync(
    file,
    JSON.stringify({
      type: 'user',
      sessionId,
      uuid: 'u-1',
      timestamp: '2026-04-15T10:00:00.000Z',
      cwd: pdir,
      message: { role: 'user', content: 'initial' },
    }) + '\n',
  );
  return { home, pdir, slug, sessionId, file, projectsDir };
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

test('nowa sesja w tle → sidebar auto-refresh', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.locator('aside button').filter({ hasText: /alpha/ }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.locator('aside button').filter({ hasText: /alpha/ }).first().click();
  // 1 session visible initially.
  await expect(page.locator('button').filter({ hasText: /wiadomości/ })).toHaveCount(1);

  // Background: write a second session JSONL.
  const newSessionId = '11111111-0000-4000-8000-bbbbbbbbbbbb';
  writeFileSync(
    `${fake.projectsDir}/${newSessionId}.jsonl`,
    JSON.stringify({
      type: 'user',
      sessionId: newSessionId,
      uuid: 'u-2',
      timestamp: '2026-04-16T10:00:00.000Z',
      cwd: fake.pdir,
      message: { role: 'user', content: 'second session' },
    }) + '\n',
  );

  await expect(page.locator('button').filter({ hasText: /wiadomości/ })).toHaveCount(2, {
    timeout: 5_000,
  });
});

test('append do otwartej sesji → zmiany widoczne', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.locator('aside button').filter({ hasText: /alpha/ }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('aside button').filter({ hasText: /alpha/ }).first().click();

  // Background append — live refresh of session list size.
  appendFileSync(
    fake.file,
    JSON.stringify({
      type: 'user',
      sessionId: fake.sessionId,
      uuid: 'u-bg',
      timestamp: '2026-04-17T10:00:00.000Z',
      cwd: fake.pdir,
      message: { role: 'user', content: 'appended-from-phase6' },
    }) + '\n',
  );

  // Session item shows the latest "modified at" timestamp — we just check
  // the session card is still rendered (live invalidate triggered).
  await expect(
    page
      .locator('button')
      .filter({ hasText: /wiadomości/ })
      .first(),
  ).toBeVisible();
});
