'use client';

import { Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSettings, useSetSettings } from '@/hooks/use-settings';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import {
  TERMINAL_FONT_SIZES,
  THEMES,
  VIEWER_DENSITIES,
  VIEWER_FONT_SIZES,
  type Settings,
  type Theme,
  type TerminalFontSize,
  type ViewerDensity,
  type ViewerFontSize,
} from '@/lib/settings/types';
import {
  MODEL_RATE_KEYS,
  type ModelPricing,
  type ModelRate,
  type ModelRateKey,
} from '@/lib/jsonl/usage';
import { EVENT_CATEGORIES, type EventCategory } from '@/lib/jsonl/outline';
import { TIMESTAMP_FORMATS, type TimestampFormat } from '@/lib/jsonl/format-timestamp';
import { cn } from '@/lib/utils';

const VIEWER_FONT_LABEL: Record<ViewerFontSize, string> = {
  xs: 'Extra small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
};

const DENSITY_LABEL: Record<ViewerDensity, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  spacious: 'Spacious',
};

const THEME_LABEL: Record<Theme, string> = {
  dark: 'Dark',
  darker: 'Darker',
  'solarized-dark': 'Solarized dark',
};

const MODEL_LABEL: Record<ModelRateKey, string> = {
  'opus-4': 'Opus 4',
  'sonnet-4': 'Sonnet 4',
  'haiku-4': 'Haiku 4',
  default: 'Default (unknown model)',
};

const CATEGORY_LABEL: Record<EventCategory, string> = {
  user: 'User',
  assistant: 'Assistant',
  tools: 'Tools',
  system: 'System',
};

const TIMESTAMP_LABEL: Record<TimestampFormat, string> = {
  relative: 'Relative (e.g. 2 min ago)',
  iso: 'ISO (2026-04-16T12:00:00Z)',
  local: 'Local (14:00:05)',
};

const RATE_FIELDS: { key: keyof ModelRate; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'cacheWrite', label: 'Cache write' },
  { key: 'cacheRead', label: 'Cache read' },
];

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { data: settings } = useSettings();
  const { mutate, isPending } = useSetSettings();

  const current: Settings = settings ?? DEFAULT_SETTINGS;

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    mutate({ [key]: value } as Partial<Settings>);
  };

  const updateRate = (model: ModelRateKey, field: keyof ModelRate, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    const nextPricing: ModelPricing = {
      ...current.modelPricing,
      [model]: { ...current.modelPricing[model], [field]: value },
    };
    update('modelPricing', nextPricing);
  };

  const toggleCategory = (c: EventCategory) => {
    const current_ = new Set(current.hiddenCategories);
    if (current_.has(c)) current_.delete(c);
    else current_.add(c);
    // Keep order stable by filtering against the canonical list.
    const next = EVENT_CATEGORIES.filter((x) => current_.has(x));
    update('hiddenCategories', next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
          <SettingsIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Appearance and typography. Changes are saved immediately.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4 text-sm" onSubmit={(e) => e.preventDefault()}>
          <Field label="Viewer font size" htmlFor="viewerFontSize">
            <select
              id="viewerFontSize"
              value={current.viewerFontSize}
              disabled={isPending}
              onChange={(e) => update('viewerFontSize', e.target.value as ViewerFontSize)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
            >
              {VIEWER_FONT_SIZES.map((v) => (
                <option key={v} value={v}>
                  {VIEWER_FONT_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Terminal font size" htmlFor="terminalFontSize">
            <select
              id="terminalFontSize"
              value={current.terminalFontSize}
              disabled={isPending}
              onChange={(e) =>
                update('terminalFontSize', Number(e.target.value) as TerminalFontSize)
              }
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
            >
              {TERMINAL_FONT_SIZES.map((v) => (
                <option key={v} value={v}>
                  {v} px
                </option>
              ))}
            </select>
          </Field>

          <Field label="Viewer density" htmlFor="viewerDensity">
            <select
              id="viewerDensity"
              value={current.viewerDensity}
              disabled={isPending}
              onChange={(e) => update('viewerDensity', e.target.value as ViewerDensity)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
            >
              {VIEWER_DENSITIES.map((v) => (
                <option key={v} value={v}>
                  {DENSITY_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Theme" htmlFor="theme">
            <select
              id="theme"
              value={current.theme}
              disabled={isPending}
              onChange={(e) => update('theme', e.target.value as Theme)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
            >
              {THEMES.map((v) => (
                <option key={v} value={v}>
                  {THEME_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Timestamp format" htmlFor="timestampFormat">
            <select
              id="timestampFormat"
              value={current.timestampFormat}
              disabled={isPending}
              onChange={(e) => update('timestampFormat', e.target.value as TimestampFormat)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
            >
              {TIMESTAMP_FORMATS.map((v) => (
                <option key={v} value={v}>
                  {TIMESTAMP_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
            <legend className="text-neutral-300">Default hidden categories</legend>
            <p className="text-[11px] text-neutral-500">
              Selected categories start hidden when a session opens. The chips in the session view
              can still be toggled locally.
            </p>
            <div className="flex flex-wrap gap-2">
              {EVENT_CATEGORIES.map((c) => {
                const hidden = current.hiddenCategories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCategory(c)}
                    disabled={isPending}
                    aria-pressed={hidden}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      hidden
                        ? 'border-neutral-600 bg-neutral-800 text-neutral-100'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300',
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
            <legend className="text-neutral-300">Model pricing (USD / 1M tokens)</legend>
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,5rem)] items-center gap-2 text-[11px] text-neutral-500">
              <span />
              {RATE_FIELDS.map((f) => (
                <span key={f.key} className="text-right">
                  {f.label}
                </span>
              ))}
            </div>
            {MODEL_RATE_KEYS.map((model) => {
              const rate = current.modelPricing[model];
              return (
                <div
                  key={model}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(4,5rem)] items-center gap-2"
                >
                  <span className="text-neutral-300">{MODEL_LABEL[model]}</span>
                  {RATE_FIELDS.map((f) => (
                    <input
                      key={f.key}
                      type="number"
                      min={0}
                      step={0.01}
                      aria-label={`${MODEL_LABEL[model]} — ${f.label}`}
                      value={rate[f.key]}
                      disabled={isPending}
                      onChange={(e) => updateRate(model, f.key, Number(e.target.value))}
                      className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-sm tabular-nums text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                    />
                  ))}
                </div>
              );
            })}
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-center justify-between gap-4">
      <span className="text-neutral-300">{label}</span>
      {children}
    </label>
  );
}
