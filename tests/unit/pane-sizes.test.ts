// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPaneSizes, savePaneSizes } from '@/lib/ui/pane-sizes';

beforeEach(() => window.localStorage.clear());

describe('pane-sizes', () => {
  it('returns null when nothing saved', () => {
    expect(loadPaneSizes('h')).toBeNull();
  });

  it('round-trips sizes per layout', () => {
    savePaneSizes('h', [30, 70]);
    savePaneSizes('quad', [60, 40, 55, 45, 50, 50]);
    expect(loadPaneSizes('h')).toEqual([30, 70]);
    expect(loadPaneSizes('quad')).toEqual([60, 40, 55, 45, 50, 50]);
  });

  it('ignores malformed json', () => {
    window.localStorage.setItem('codehelm:pane-sizes', '{broken');
    expect(loadPaneSizes('h')).toBeNull();
  });

  it('rejects non-numeric entries', () => {
    window.localStorage.setItem(
      'codehelm:pane-sizes',
      JSON.stringify({ h: [30, 'oops'] }),
    );
    expect(loadPaneSizes('h')).toBeNull();
  });
});
