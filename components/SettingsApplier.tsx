'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/use-settings';
import {
  type Settings,
  type Theme,
  type ViewerDensity,
  type ViewerFontSize,
} from '@/lib/settings/io';

const VIEWER_FONT_PX: Record<ViewerFontSize, string> = {
  xs: '12px',
  sm: '13px',
  md: '14px',
  lg: '16px',
};

const DENSITY_PAD: Record<ViewerDensity, string> = {
  compact: '0.25rem',
  comfortable: '0.5rem',
  spacious: '0.875rem',
};

const DENSITY_LINE_HEIGHT: Record<ViewerDensity, string> = {
  compact: '1.35',
  comfortable: '1.5',
  spacious: '1.75',
};

export function applySettingsToDocument(
  doc: { documentElement: HTMLElement } | null,
  s: Settings,
): void {
  if (!doc) return;
  const root = doc.documentElement;
  root.style.setProperty('--ui-viewer-font-size', VIEWER_FONT_PX[s.viewerFontSize]);
  root.style.setProperty('--ui-terminal-font-size', `${s.terminalFontSize}px`);
  root.style.setProperty('--ui-viewer-pad', DENSITY_PAD[s.viewerDensity]);
  root.style.setProperty('--ui-viewer-line-height', DENSITY_LINE_HEIGHT[s.viewerDensity]);
  root.dataset['theme'] = s.theme;
}

export function SettingsApplier() {
  const { data } = useSettings();
  useEffect(() => {
    if (!data) return;
    if (typeof document === 'undefined') return;
    applySettingsToDocument(document, data);
  }, [data]);
  return null;
}

export const __test = { VIEWER_FONT_PX, DENSITY_PAD, DENSITY_LINE_HEIGHT } as {
  VIEWER_FONT_PX: Record<ViewerFontSize, string>;
  DENSITY_PAD: Record<ViewerDensity, string>;
  DENSITY_LINE_HEIGHT: Record<ViewerDensity, string>;
} & { __theme?: Theme };
