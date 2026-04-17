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
import { DEFAULT_SETTINGS } from '@/lib/settings/io';
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
} from '@/lib/settings/io';
import {
  MODEL_RATE_KEYS,
  type ModelPricing,
  type ModelRate,
  type ModelRateKey,
} from '@/lib/jsonl/usage';

const VIEWER_FONT_LABEL: Record<ViewerFontSize, string> = {
  xs: 'Bardzo mały',
  sm: 'Mały',
  md: 'Średni',
  lg: 'Duży',
};

const DENSITY_LABEL: Record<ViewerDensity, string> = {
  compact: 'Zwarty',
  comfortable: 'Wygodny',
  spacious: 'Przestronny',
};

const THEME_LABEL: Record<Theme, string> = {
  dark: 'Ciemny',
  darker: 'Ciemniejszy',
  'solarized-dark': 'Solarized dark',
};

const MODEL_LABEL: Record<ModelRateKey, string> = {
  'opus-4': 'Opus 4',
  'sonnet-4': 'Sonnet 4',
  'haiku-4': 'Haiku 4',
  default: 'Domyślny (nieznany model)',
};

const RATE_FIELDS: { key: keyof ModelRate; label: string }[] = [
  { key: 'input', label: 'Wejście' },
  { key: 'output', label: 'Wyjście' },
  { key: 'cacheWrite', label: 'Zapis cache' },
  { key: 'cacheRead', label: 'Odczyt cache' },
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Ustawienia"
          title="Ustawienia"
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
          <SettingsIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ustawienia</DialogTitle>
          <DialogDescription>
            Wygląd aplikacji i czcionki. Zapis jest natychmiastowy.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4 text-sm" onSubmit={(e) => e.preventDefault()}>
          <Field label="Rozmiar czcionki w historii" htmlFor="viewerFontSize">
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

          <Field label="Rozmiar czcionki w terminalu" htmlFor="terminalFontSize">
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

          <Field label="Gęstość widoku" htmlFor="viewerDensity">
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

          <Field label="Motyw" htmlFor="theme">
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

          <fieldset className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
            <legend className="text-neutral-300">Cennik modeli (USD / 1 mln tokenów)</legend>
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
