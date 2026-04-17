import { describe, expect, it } from 'vitest';
import { applySettingsToDocument } from '@/components/SettingsApplier';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';

describe('applySettingsToDocument', () => {
  it('writes CSS variables and theme attribute on <html>', () => {
    const root = document.createElement('html');
    applySettingsToDocument(
      { documentElement: root } as unknown as Document,
      {
        ...DEFAULT_SETTINGS,
        viewerFontSize: 'lg',
        terminalFontSize: 16,
        viewerDensity: 'compact',
        theme: 'darker',
      },
    );
    expect(root.style.getPropertyValue('--ui-viewer-font-size')).toBe('16px');
    expect(root.style.getPropertyValue('--ui-terminal-font-size')).toBe('16px');
    expect(root.style.getPropertyValue('--ui-viewer-pad')).toBe('0.25rem');
    expect(root.dataset['theme']).toBe('darker');
  });

  it('handles null doc safely', () => {
    expect(() => applySettingsToDocument(null, { ...DEFAULT_SETTINGS })).not.toThrow();
  });
});
