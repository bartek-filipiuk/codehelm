import { describe, expect, it } from 'vitest';
import { isHostAllowed, isOriginAllowed } from '@/lib/security/host-check';

describe('isHostAllowed', () => {
  const port = 54321;

  it('akceptuje 127.0.0.1:PORT', () => {
    expect(isHostAllowed(`127.0.0.1:${port}`, port)).toBe(true);
  });

  it('akceptuje localhost:PORT', () => {
    expect(isHostAllowed(`localhost:${port}`, port)).toBe(true);
  });

  it('odrzuca 127.0.0.1:inny-port', () => {
    expect(isHostAllowed(`127.0.0.1:99999`, port)).toBe(false);
  });

  it('odrzuca 127.0.0.1 bez portu', () => {
    expect(isHostAllowed(`127.0.0.1`, port)).toBe(false);
  });

  it('odrzuca evil.com', () => {
    expect(isHostAllowed(`evil.com`, port)).toBe(false);
    expect(isHostAllowed(`evil.com:${port}`, port)).toBe(false);
  });

  it('odrzuca rebinding 127.0.0.1.evil.com', () => {
    expect(isHostAllowed(`127.0.0.1.evil.com:${port}`, port)).toBe(false);
  });

  it('odrzuca null/undefined/pusty', () => {
    expect(isHostAllowed(null, port)).toBe(false);
    expect(isHostAllowed(undefined, port)).toBe(false);
    expect(isHostAllowed('', port)).toBe(false);
  });

  it('odrzuca IPv6 [::1]:PORT (nie wspieramy)', () => {
    expect(isHostAllowed(`[::1]:${port}`, port)).toBe(false);
  });

  it('odrzuca 0.0.0.0', () => {
    expect(isHostAllowed(`0.0.0.0:${port}`, port)).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  const port = 54321;
  const origin = `http://127.0.0.1:${port}`;

  it('akceptuje dokładny match', () => {
    expect(isOriginAllowed(origin, port)).toBe(true);
  });

  it('akceptuje localhost wariant', () => {
    expect(isOriginAllowed(`http://localhost:${port}`, port)).toBe(true);
  });

  it('odrzuca https:// (zawsze HTTP dla 127.0.0.1)', () => {
    expect(isOriginAllowed(`https://127.0.0.1:${port}`, port)).toBe(false);
  });

  it('odrzuca inny port', () => {
    expect(isOriginAllowed(`http://127.0.0.1:99999`, port)).toBe(false);
  });

  it('odrzuca evil origin', () => {
    expect(isOriginAllowed(`http://evil.com`, port)).toBe(false);
    expect(isOriginAllowed(`http://evil.com:${port}`, port)).toBe(false);
  });

  it('odrzuca trailing slash/path', () => {
    expect(isOriginAllowed(`${origin}/`, port)).toBe(false);
    expect(isOriginAllowed(`${origin}/foo`, port)).toBe(false);
  });

  it('odrzuca null/undefined', () => {
    expect(isOriginAllowed(null, port)).toBe(false);
    expect(isOriginAllowed(undefined, port)).toBe(false);
  });
});
