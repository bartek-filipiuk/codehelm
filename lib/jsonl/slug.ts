/**
 * Claude Code uses dir names like `-home-bartek-main-projects-foo` to represent
 * `/home/bartek/main-projects/foo`. The mapping is LOSSY — `foo-bar` could
 * decode to `/foo-bar` OR `/foo/bar`. For UI display we produce a best-effort
 * path, but REAL resolved path is always pulled from the first event's `cwd`
 * in the session files (see lib/jsonl/index.ts).
 */

const SLUG_RE = /^[A-Za-z0-9._-]+$/;

export function isValidSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.includes('..')) return false;
  if (slug.includes('\0')) return false;
  if (slug.includes('/')) return false;
  return SLUG_RE.test(slug);
}

/** Best-effort path reconstruction (display only, NEVER for IO). */
export function decodeSlugToDisplayPath(slug: string): string {
  if (!isValidSlug(slug)) return slug;
  // Treat a leading `-` as the root `/` marker, subsequent `-` as `/`.
  if (slug.startsWith('-')) return '/' + slug.slice(1).replaceAll('-', '/');
  return slug.replaceAll('-', '/');
}
