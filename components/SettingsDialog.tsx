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

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { data: settings } = useSettings();
  const { mutate, isPending } = useSetSettings();

  const current: Settings = settings ?? {
    viewerFontSize: 'md',
    terminalFontSize: 13,
    viewerDensity: 'comfortable',
    theme: 'dark',
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    mutate({ [key]: value } as Partial<Settings>);
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
