import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertInside } from '@/lib/security/path-guard';

// Pre-resolve tmpdir symlinks (on macOS, /var → /private/var) so that ROOT
// matches what assertInside returns after its own realpath() pass.
const TMP = join(realpathSync(tmpdir()), `codehelm-path-guard-${Date.now()}`);
const ROOT = join(TMP, 'root');
const OUTSIDE = join(TMP, 'outside');

beforeAll(async () => {
  await mkdir(ROOT, { recursive: true });
  await mkdir(OUTSIDE, { recursive: true });
  await writeFile(join(ROOT, 'legit.txt'), 'ok');
  await writeFile(join(OUTSIDE, 'secret.txt'), 'nope');
  await mkdir(join(ROOT, 'subdir'), { recursive: true });
  await writeFile(join(ROOT, 'subdir', 'nested.txt'), 'deep');
  await symlink(join(OUTSIDE, 'secret.txt'), join(ROOT, 'evil-symlink.txt'));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('assertInside — happy path', () => {
  it('accepts a file directly in root', async () => {
    const resolved = await assertInside(ROOT, join(ROOT, 'legit.txt'));
    expect(resolved).toBe(join(ROOT, 'legit.txt'));
  });

  it('accepts a file inside a subdirectory', async () => {
    const resolved = await assertInside(ROOT, join(ROOT, 'subdir', 'nested.txt'));
    expect(resolved).toBe(join(ROOT, 'subdir', 'nested.txt'));
  });

  it('accepts the root itself', async () => {
    const resolved = await assertInside(ROOT, ROOT);
    expect(resolved).toBe(ROOT);
  });
});

describe('assertInside — 100-payload fuzz', () => {
  const payloads: { name: string; input: string }[] = [
    // Classic traversal
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `parent ${i}`,
      input: join(ROOT, '../'.repeat(i + 1) + 'etc/passwd'),
    })),
    // URL-encoded traversal
    { name: 'url-encoded ../', input: join(ROOT, '%2e%2e%2f', 'etc', 'passwd') },
    { name: 'double url-encoded', input: join(ROOT, '%252e%252e%252f', 'passwd') },
    // Null byte injection (Node rejects this at the fs layer)
    { name: 'null byte', input: `${ROOT}/legit.txt\0.evil` },
    // UTF-8 tricks
    { name: 'fullwidth dot', input: join(ROOT, '．．', 'etc') },
    { name: 'overlong utf-8', input: `${ROOT}/\uFEFF../etc` },
    // Absolute paths out
    { name: 'absolute /etc/passwd', input: '/etc/passwd' },
    { name: 'absolute HOME', input: '/root/.ssh/id_rsa' },
    // Case-sensitivity probe. On case-insensitive filesystems (macOS APFS default)
    // `ROOT.toUpperCase()` resolves to ROOT itself — legitimate self-root access,
    // not an escape. Use uppercased-prefix + 'EVIL' to probe prefix collisions on
    // both case-sensitive (Linux) and case-insensitive (macOS/Windows) hosts.
    { name: 'CASE prefix collision', input: `${ROOT.toUpperCase()}EVIL/file` },
    // Prefix collision
    { name: 'prefix collision', input: `${ROOT}EVIL/file` },
    { name: 'prefix collision with slash', input: `${ROOT}/../${ROOT.split('/').pop()}EVIL/file` },
    // Symlink escape
    { name: 'symlink escape', input: join(ROOT, 'evil-symlink.txt') },
    // Empty / malformed
    { name: 'empty', input: '' },
    { name: 'single dot', input: '.' },
    { name: 'double dot', input: '..' },
    // Long paths
    { name: 'very long /../', input: join(ROOT, '/..'.repeat(50)) },
    // Trailing separator tricks
    { name: 'trailing slash', input: `${ROOT}/../outside/secret.txt` },
    { name: 'double slash', input: `${ROOT}//../outside/secret.txt` },
    // Backslashes (non-Linux idiom — still validated)
    { name: 'backslash traversal', input: `${ROOT}\\..\\outside\\secret.txt` },
    // Concurrent ../
    { name: 'multi ../', input: join(ROOT, 'subdir', '..', '..', 'outside', 'secret.txt') },
  ];

  // Every payload below MUST resolve outside ROOT after join/resolve.
  const ESCAPING = [
    '..',
    '../',
    '../../',
    '../../../',
    './subdir/../../outside',
    './subdir/../../outside/secret.txt',
    'legit.txt/../../outside',
    '..',
    '../',
    '../../outside',
    'subdir/../../outside',
    'subdir/../../outside/secret.txt',
  ];
  // Plus absolute paths outside (not joined with ROOT).
  const ABSOLUTE_OUT = [
    '/etc/passwd',
    '/etc',
    '/root',
    '/usr/bin/env',
    OUTSIDE,
    join(OUTSIDE, 'secret.txt'),
  ];

  while (payloads.length < 90) {
    const rnd = ESCAPING[Math.floor(Math.random() * ESCAPING.length)];
    if (!rnd) continue;
    payloads.push({ name: `escape: ${rnd}`, input: join(ROOT, rnd) });
  }
  while (payloads.length < 100) {
    const abs = ABSOLUTE_OUT[Math.floor(Math.random() * ABSOLUTE_OUT.length)];
    if (!abs) continue;
    payloads.push({ name: `abs: ${abs}`, input: abs });
  }

  it.each(payloads)('rejects: $name', async ({ input }) => {
    await expect(assertInside(ROOT, input)).rejects.toThrow();
  });
});

describe('assertInside — prefix collision', () => {
  it('rejects a directory whose name shares the root prefix', async () => {
    const evilRoot = `${ROOT}EVIL`;
    await mkdir(evilRoot, { recursive: true });
    await writeFile(join(evilRoot, 'x.txt'), 'x');
    try {
      await expect(assertInside(ROOT, join(evilRoot, 'x.txt'))).rejects.toThrow();
    } finally {
      await rm(evilRoot, { recursive: true, force: true });
    }
  });
});
