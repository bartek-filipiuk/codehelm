// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isProjectGrouping,
  loadLayout,
  patchLayout,
  LAYOUT_STORAGE_KEY,
} from '@/lib/ui/layout-storage';

beforeEach(() => {
  window.localStorage.clear();
});

describe('layout-storage editorPreview', () => {
  it('domyślnie editorPreview jest undefined', () => {
    expect(loadLayout().editorPreview).toBeUndefined();
  });

  it('patchLayout zapisuje editorPreview=true i loadLayout je czyta', () => {
    patchLayout({ editorPreview: true });
    expect(loadLayout().editorPreview).toBe(true);
  });

  it('patchLayout zapisuje editorPreview=false', () => {
    patchLayout({ editorPreview: false });
    expect(loadLayout().editorPreview).toBe(false);
  });

  it('ignoruje nielogiczną wartość', () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ editorPreview: 'yes' }),
    );
    expect(loadLayout().editorPreview).toBeUndefined();
  });

  it('zachowuje inne pola przy patchu editorPreview', () => {
    patchLayout({ sidebar: 250, editorPreview: true });
    const loaded = loadLayout();
    expect(loaded.sidebar).toBe(250);
    expect(loaded.editorPreview).toBe(true);
  });
});

describe('layout-storage projectGrouping', () => {
  it('is undefined by default', () => {
    expect(loadLayout().projectGrouping).toBeUndefined();
  });

  it('round-trips the value through patchLayout', () => {
    patchLayout({ projectGrouping: 'prefix' });
    expect(loadLayout().projectGrouping).toBe('prefix');
    patchLayout({ projectGrouping: 'flat' });
    expect(loadLayout().projectGrouping).toBe('flat');
  });

  it('ignores invalid stored values', () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ projectGrouping: 'tree' }),
    );
    expect(loadLayout().projectGrouping).toBeUndefined();
  });

  it('isProjectGrouping narrows the type', () => {
    expect(isProjectGrouping('flat')).toBe(true);
    expect(isProjectGrouping('prefix')).toBe(true);
    expect(isProjectGrouping('tree')).toBe(false);
    expect(isProjectGrouping(42)).toBe(false);
  });
});
