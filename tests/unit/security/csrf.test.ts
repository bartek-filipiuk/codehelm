import { describe, expect, it } from 'vitest';
import { issueCsrf, verifyCsrf } from '@/lib/security/csrf';

describe('issueCsrf', () => {
  it('zwraca parę cookie+header identycznej wartości', () => {
    const { cookie, header } = issueCsrf();
    expect(cookie).toBe(header);
  });

  it('generuje unikalne tokeny', () => {
    const a = issueCsrf();
    const b = issueCsrf();
    expect(a.cookie).not.toBe(b.cookie);
  });

  it('token ma długość 64 hex (32 bajty)', () => {
    const { cookie } = issueCsrf();
    expect(cookie).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyCsrf', () => {
  it('akceptuje match', () => {
    const { cookie, header } = issueCsrf();
    expect(verifyCsrf(cookie, header)).toBe(true);
  });

  it('odrzuca mismatch', () => {
    const a = issueCsrf();
    const b = issueCsrf();
    expect(verifyCsrf(a.cookie, b.header)).toBe(false);
  });

  it('odrzuca null/undefined/pusty', () => {
    expect(verifyCsrf(null, null)).toBe(false);
    expect(verifyCsrf(undefined, undefined)).toBe(false);
    expect(verifyCsrf('', '')).toBe(false);
    expect(verifyCsrf('x', '')).toBe(false);
    expect(verifyCsrf('', 'x')).toBe(false);
  });

  it('odrzuca różne długości bez rzutu', () => {
    expect(() => verifyCsrf('short', 'much-longer')).not.toThrow();
    expect(verifyCsrf('short', 'much-longer')).toBe(false);
  });

  it('odrzuca tampered (byte swap)', () => {
    const { cookie } = issueCsrf();
    const tampered = (cookie[0] === 'a' ? 'b' : 'a') + cookie.slice(1);
    expect(verifyCsrf(cookie, tampered)).toBe(false);
  });
});
