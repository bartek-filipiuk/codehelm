import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;
let stateDir: string;
let SETTINGS_FILE: string;

vi.mock('@/lib/server/config', () => {
  return {
    PATHS: {
      get HOME() {
        return tmpHome;
      },
      get CLAUDE_DIR() {
        return join(tmpHome, '.claude');
      },
      get CLAUDE_PROJECTS_DIR() {
        return join(tmpHome, '.claude', 'projects');
      },
      get CLAUDE_GLOBAL_MD() {
        return join(tmpHome, '.claude', 'CLAUDE.md');
      },
      get CLAUDE_UI_STATE_DIR() {
        return join(tmpHome, '.claude', 'claude-ui');
      },
      get AUDIT_LOG() {
        return join(tmpHome, '.claude', 'claude-ui', 'audit.log');
      },
    },
  };
});

beforeEach(async () => {
  tmpHome = join(tmpdir(), `claude-ui-settings-${randomBytes(6).toString('hex')}`);
  stateDir = join(tmpHome, '.claude', 'claude-ui');
  SETTINGS_FILE = join(stateDir, 'settings.json');
  await mkdir(stateDir, { recursive: true });
  vi.resetModules();
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
});

async function loadModule() {
  return import('@/lib/settings/io');
}

describe('readSettings', () => {
  it('returns defaults when file missing', async () => {
    const { readSettings, DEFAULT_SETTINGS } = await loadModule();
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when JSON is invalid', async () => {
    await writeFile(SETTINGS_FILE, '{ not json', 'utf8');
    const { readSettings, DEFAULT_SETTINGS } = await loadModule();
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('reads valid settings', async () => {
    await writeFile(
      SETTINGS_FILE,
      JSON.stringify({
        viewerFontSize: 'lg',
        terminalFontSize: 16,
        viewerDensity: 'compact',
        theme: 'darker',
      }),
      'utf8',
    );
    const { readSettings } = await loadModule();
    const out = await readSettings();
    expect(out).toEqual({
      viewerFontSize: 'lg',
      terminalFontSize: 16,
      viewerDensity: 'compact',
      theme: 'darker',
    });
  });

  it('falls back per-field for partially corrupt input', async () => {
    await writeFile(
      SETTINGS_FILE,
      JSON.stringify({
        viewerFontSize: 'lg',
        terminalFontSize: 999, // invalid
        viewerDensity: 'spacious',
        theme: 'mauve', // invalid
      }),
      'utf8',
    );
    const { readSettings, DEFAULT_SETTINGS } = await loadModule();
    const out = await readSettings();
    expect(out.viewerFontSize).toBe('lg');
    expect(out.viewerDensity).toBe('spacious');
    expect(out.terminalFontSize).toBe(DEFAULT_SETTINGS.terminalFontSize);
    expect(out.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});

describe('writeSettings', () => {
  it('writes file with mode 0600 atomically', async () => {
    const { writeSettings, DEFAULT_SETTINGS } = await loadModule();
    await writeSettings({ ...DEFAULT_SETTINGS, theme: 'solarized-dark' });
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    expect(JSON.parse(raw).theme).toBe('solarized-dark');
    const st = await stat(SETTINGS_FILE);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('rejects an invalid payload', async () => {
    const { writeSettings, DEFAULT_SETTINGS } = await loadModule();
    await expect(
      writeSettings({ ...DEFAULT_SETTINGS, theme: 'mauve' as never }),
    ).rejects.toBeDefined();
  });
});

describe('patchSettings', () => {
  it('merges patch onto stored settings', async () => {
    const { patchSettings, readSettings } = await loadModule();
    await patchSettings({ theme: 'darker' });
    await patchSettings({ viewerFontSize: 'lg' });
    const out = await readSettings();
    expect(out.theme).toBe('darker');
    expect(out.viewerFontSize).toBe('lg');
  });

  it('persists across reads (simulated restart)', async () => {
    const m1 = await loadModule();
    await m1.patchSettings({ terminalFontSize: 16 });
    vi.resetModules();
    const m2 = await loadModule();
    expect((await m2.readSettings()).terminalFontSize).toBe(16);
  });
});
