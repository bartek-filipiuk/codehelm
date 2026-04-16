import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const home = mkdtempSync(`${tmpdir()}/claude-ui-phase7-`);
  const pdir = `${home}/proj`;
  mkdirSync(pdir, { recursive: true });
  const slug = pdir.replace(/\//g, '-');
  const projectsDir = `${home}/.claude/projects/${slug}`;
  mkdirSync(projectsDir, { recursive: true });
  const sessionId = '00000000-0000-4000-8000-aaaaaaaaaaaa';
  writeFileSync(
    `${projectsDir}/${sessionId}.jsonl`,
    JSON.stringify({
      type: 'user',
      sessionId,
      uuid: 'u-1',
      timestamp: '2026-04-15T10:00:00.000Z',
      cwd: pdir,
      message: { role: 'user', content: 'initial' },
    }) + '\n',
  );
  return { home, pdir, slug };
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

test('edytuję globalny CLAUDE.md i zapisuję', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.locator('aside button').filter({ hasText: /proj/ }).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('button', { name: 'CLAUDE.md' }).click();
  await page.getByRole('button', { name: 'Global' }).click();

  // Wait for CodeMirror to mount.
  const editor = page.locator('.cm-editor').first();
  await expect(editor).toBeVisible({ timeout: 10_000 });

  // Focus, type content.
  const editable = page.locator('.cm-content').first();
  await editable.click();
  await page.keyboard.type('# Global config\n\nphase-7-marker');
  await expect(page.getByText(/unsaved/)).toBeVisible();

  // Save via Ctrl+S.
  await page.keyboard.press('Control+s');
  await expect(page.getByText(/^Saved$/)).toBeVisible({ timeout: 5_000 });

  // On-disk check.
  const onDisk = readFileSync(`${fake.home}/.claude/CLAUDE.md`, 'utf8');
  expect(onDisk).toContain('phase-7-marker');
});

test('per-project CLAUDE.md pisze do <project>/CLAUDE.md', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('aside button').filter({ hasText: /proj/ }).first().click();
  await page.getByRole('button', { name: 'CLAUDE.md' }).click();
  await page.getByRole('button', { name: 'Per-project' }).click();

  const editor = page.locator('.cm-editor').first();
  await expect(editor).toBeVisible({ timeout: 10_000 });

  await page.locator('.cm-content').first().click();
  await page.keyboard.type('# Per-project\n\nproject-marker');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText(/^Saved$/)).toBeVisible({ timeout: 5_000 });

  const onDisk = readFileSync(`${fake.pdir}/CLAUDE.md`, 'utf8');
  expect(onDisk).toContain('project-marker');
});
