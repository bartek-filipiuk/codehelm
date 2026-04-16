import { describe, expect, it } from 'vitest';
import { generateNonce, makeCsp } from '@/lib/security/csp';

describe('generateNonce', () => {
  it('zwraca base64 string min 22 znaków (16 bajtów)', () => {
    const nonce = generateNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(22);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('unikalne w 1000 iteracji', () => {
    const set = new Set(Array.from({ length: 1000 }, generateNonce));
    expect(set.size).toBe(1000);
  });
});

describe('makeCsp', () => {
  it('zawiera nonce w script-src', () => {
    const nonce = 'abc123';
    const csp = makeCsp(nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toMatch(/script-src[^;]*'nonce-abc123'/);
  });

  it('nie zawiera unsafe-inline w script-src', () => {
    const csp = makeCsp('x');
    const scriptSrc = csp.match(/script-src[^;]*/)?.[0] ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('nie zawiera unsafe-eval', () => {
    const csp = makeCsp('x');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('zawiera default-src self', () => {
    const csp = makeCsp('x');
    expect(csp).toMatch(/default-src[^;]*'self'/);
  });

  it('zawiera connect-src pozwalający na ws://', () => {
    const csp = makeCsp('x');
    expect(csp).toMatch(/connect-src[^;]*'self'[^;]*ws:/);
  });

  it('zawiera frame-ancestors none', () => {
    const csp = makeCsp('x');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('zawiera object-src none', () => {
    const csp = makeCsp('x');
    expect(csp).toContain("object-src 'none'");
  });

  it('zawiera base-uri self', () => {
    const csp = makeCsp('x');
    expect(csp).toContain("base-uri 'self'");
  });
});
