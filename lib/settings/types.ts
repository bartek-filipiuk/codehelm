import { z } from 'zod';
import { DEFAULT_MODEL_PRICING, MODEL_RATE_KEYS, type ModelPricing } from '@/lib/jsonl/usage';
import { EVENT_CATEGORIES, type EventCategory } from '@/lib/jsonl/outline';
import { TIMESTAMP_FORMATS, type TimestampFormat } from '@/lib/jsonl/format-timestamp';

// Pure types + constants + zod schemas. No node imports so client bundles
// (SettingsDialog, useSettings, SettingsApplier) can pull from here safely.
// The IO layer (read/write to disk) lives in ./io.ts and re-exports these.

export const VIEWER_FONT_SIZES = ['xs', 'sm', 'md', 'lg'] as const;
export const TERMINAL_FONT_SIZES = [12, 13, 14, 16] as const;
export const VIEWER_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const THEMES = ['dark', 'darker', 'solarized-dark'] as const;

export type ViewerFontSize = (typeof VIEWER_FONT_SIZES)[number];
export type TerminalFontSize = (typeof TERMINAL_FONT_SIZES)[number];
export type ViewerDensity = (typeof VIEWER_DENSITIES)[number];
export type Theme = (typeof THEMES)[number];

export interface TerminalQuickAction {
  label: string;
  command: string;
}

export const TERMINAL_QUICK_ACTION_LIMITS = {
  maxActions: 12,
  maxLabelLength: 40,
  maxCommandLength: 400,
} as const;

export interface Settings {
  viewerFontSize: ViewerFontSize;
  terminalFontSize: TerminalFontSize;
  viewerDensity: ViewerDensity;
  theme: Theme;
  modelPricing: ModelPricing;
  hiddenCategories: EventCategory[];
  timestampFormat: TimestampFormat;
  terminalQuickActions: TerminalQuickAction[];
}

export const DEFAULT_TERMINAL_QUICK_ACTIONS: TerminalQuickAction[] = [
  { label: 'git status', command: 'git status' },
  { label: 'git log', command: 'git log --oneline -10' },
  { label: 'pnpm test', command: 'pnpm test' },
  { label: 'pnpm dev', command: 'pnpm dev' },
];

export const DEFAULT_SETTINGS: Settings = {
  viewerFontSize: 'md',
  terminalFontSize: 13,
  viewerDensity: 'comfortable',
  theme: 'dark',
  modelPricing: DEFAULT_MODEL_PRICING,
  hiddenCategories: [],
  timestampFormat: 'relative',
  terminalQuickActions: DEFAULT_TERMINAL_QUICK_ACTIONS,
};

const nonNegative = z.number().nonnegative().finite();

const ModelRateSchema = z.object({
  input: nonNegative,
  output: nonNegative,
  cacheWrite: nonNegative,
  cacheRead: nonNegative,
});

const ModelPricingSchema = z.object(
  Object.fromEntries(MODEL_RATE_KEYS.map((k) => [k, ModelRateSchema])) as Record<
    (typeof MODEL_RATE_KEYS)[number],
    typeof ModelRateSchema
  >,
);

const TerminalQuickActionSchema = z.object({
  label: z.string().trim().min(1).max(TERMINAL_QUICK_ACTION_LIMITS.maxLabelLength),
  command: z.string().min(1).max(TERMINAL_QUICK_ACTION_LIMITS.maxCommandLength),
});

export const SettingsSchema = z.object({
  viewerFontSize: z.enum(VIEWER_FONT_SIZES),
  terminalFontSize: z.union([z.literal(12), z.literal(13), z.literal(14), z.literal(16)]),
  viewerDensity: z.enum(VIEWER_DENSITIES),
  theme: z.enum(THEMES),
  modelPricing: ModelPricingSchema,
  hiddenCategories: z.array(z.enum(EVENT_CATEGORIES)),
  timestampFormat: z.enum(TIMESTAMP_FORMATS),
  terminalQuickActions: z
    .array(TerminalQuickActionSchema)
    .max(TERMINAL_QUICK_ACTION_LIMITS.maxActions),
});

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export function applyDefaults(raw: unknown): Settings {
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
