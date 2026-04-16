import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PATHS } from '@/lib/server/config';

export const VIEWER_FONT_SIZES = ['xs', 'sm', 'md', 'lg'] as const;
export const TERMINAL_FONT_SIZES = [12, 13, 14, 16] as const;
export const VIEWER_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const THEMES = ['dark', 'darker', 'solarized-dark'] as const;

export type ViewerFontSize = (typeof VIEWER_FONT_SIZES)[number];
export type TerminalFontSize = (typeof TERMINAL_FONT_SIZES)[number];
export type ViewerDensity = (typeof VIEWER_DENSITIES)[number];
export type Theme = (typeof THEMES)[number];

export interface Settings {
  viewerFontSize: ViewerFontSize;
  terminalFontSize: TerminalFontSize;
  viewerDensity: ViewerDensity;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  viewerFontSize: 'md',
  terminalFontSize: 13,
  viewerDensity: 'comfortable',
  theme: 'dark',
};

export const SettingsSchema = z.object({
  viewerFontSize: z.enum(VIEWER_FONT_SIZES),
  terminalFontSize: z.union([
    z.literal(12),
    z.literal(13),
    z.literal(14),
    z.literal(16),
  ]),
  viewerDensity: z.enum(VIEWER_DENSITIES),
  theme: z.enum(THEMES),
});

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

const SETTINGS_FILE = join(PATHS.CLAUDE_UI_STATE_DIR, 'settings.json');

function applyDefaults(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const merged = { ...(raw as Record<string, unknown>) };
  const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...merged });
  if (parsed.success) return parsed.data;
  // Field-by-field fallback so a single corrupt key doesn't reset the rest.
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(out) as (keyof Settings)[]) {
    const candidate = merged[key];
    const single = SettingsSchema.shape[key].safeParse(candidate);
    if (single.success) {
      Object.assign(out, { [key]: single.data });
    }
  }
  return out;
}

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
