import { describe, expect, it } from 'vitest';
import { generateToken, safeCompare } from '@/lib/security/token';

describe('generateToken', () => {
  it('zwraca hex string długości 64 (32 bajty)', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generuje unikalne tokeny (1000 iteracji)', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
  });
});

describe('safeCompare', () => {
  it('zwraca true dla identycznych stringów', () => {
    const token = generateToken();
    expect(safeCompare(token, token)).toBe(true);
  });

  it('zwraca false dla różnych stringów tej samej długości', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    expect(safeCompare(a, b)).toBe(false);
  });

  it('zwraca false dla różnych długości bez rzutu', () => {
    expect(() => safeCompare('short', 'much-longer-string')).not.toThrow();
    expect(safeCompare('short', 'much-longer-string')).toBe(false);
  });

  it('zwraca false dla pustych stringów', () => {
    expect(safeCompare('', '')).toBe(false);
    expect(safeCompare('', 'x')).toBe(false);
    expect(safeCompare('x', '')).toBe(false);
  });

  it('nie rzuca na nie-hex input', () => {
    expect(() => safeCompare('żółć', 'ASCII')).not.toThrow();
    expect(safeCompare('żółć', 'żółć')).toBe(true);
  });
});
