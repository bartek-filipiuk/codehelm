import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '@/lib/server/config';
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  applyDefaults,
  type Settings,
  type SettingsPatch,
} from './types';

// Re-export everything pure so existing "from '@/lib/settings/io'" imports
// from SERVER-side code (route handlers) still work. Client-side code
// (components, hooks, tests in jsdom) must import from './types' directly
// to avoid webpack trying to bundle node:fs/node:crypto into the browser.
export {
  VIEWER_FONT_SIZES,
  TERMINAL_FONT_SIZES,
  VIEWER_DENSITIES,
  THEMES,
  DEFAULT_SETTINGS,
  SettingsSchema,
  SettingsPatchSchema,
  applyDefaults,
} from './types';
export type {
  Settings,
  SettingsPatch,
  ViewerFontSize,
  TerminalFontSize,
  ViewerDensity,
  Theme,
} from './types';

const SETTINGS_FILE = join(PATHS.CLAUDE_UI_STATE_DIR, 'settings.json');

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    return applyDefaults(JSON.parse(raw) as unknown);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(next: Settings): Promise<Settings> {
  const validated = SettingsSchema.parse(next);
  const dir = dirname(SETTINGS_FILE);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = `${SETTINGS_FILE}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(validated, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(tmp, SETTINGS_FILE);
  await chmod(SETTINGS_FILE, 0o600).catch(() => undefined);
  return validated;
}

export async function patchSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await readSettings();
  const next: Settings = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    Object.assign(next, { [key]: value });
  }
  return writeSettings(next);
}

export const __test = {
  SETTINGS_FILE,
  applyDefaults,
};
