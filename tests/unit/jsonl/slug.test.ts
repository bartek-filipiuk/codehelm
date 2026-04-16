import { describe, it, expect } from 'vitest';
import { decodeSlugToDisplayPath, isValidSlug } from '@/lib/jsonl/slug';

describe('isValidSlug', () => {
  it('akceptuje typowe slug', () => {
    expect(isValidSlug('-home-bartek-main-projects-foo')).toBe(true);
    expect(isValidSlug('-a0-usr-workdir')).toBe(true);
    expect(isValidSlug('foo')).toBe(true);
  });

  it('odrzuca slash', () => {
    expect(isValidSlug('home/bartek')).toBe(false);
  });

  it('odrzuca dot-dot', () => {
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('foo/../bar')).toBe(false);
    expect(isValidSlug('-home-..-etc')).toBe(false);
  });

  it('odrzuca null byte', () => {
    expect(isValidSlug('foo\0')).toBe(false);
  });

  it('odrzuca pusty', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('odrzuca znaki specjalne', () => {
    expect(isValidSlug('foo bar')).toBe(false);
    expect(isValidSlug('foo&bar')).toBe(false);
    expect(isValidSlug('<script>')).toBe(false);
  });
});

describe('decodeSlugToDisplayPath', () => {
  it('dekoduje slug zaczynający się od -', () => {
    expect(decodeSlugToDisplayPath('-home-bartek-foo')).toBe('/home/bartek/foo');
  });

  it('dekoduje slug bez leading -', () => {
    expect(decodeSlugToDisplayPath('a-b-c')).toBe('a/b/c');
  });

  it('zwraca wejście dla invalid slug', () => {
    expect(decodeSlugToDisplayPath('foo/bar')).toBe('foo/bar');
  });

  it('round-trip dla typowych ścieżek', () => {
    const cases = [
      ['-home-bartek-foo', '/home/bartek/foo'],
      ['-tmp', '/tmp'],
      ['-home-a-b', '/home/a/b'],
    ] as const;
    for (const [slug, expected] of cases) {
      expect(decodeSlugToDisplayPath(slug)).toBe(expected);
    }
  });
});
