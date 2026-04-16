import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

const FAKE_HOME = resolve(__dirname, '..', '..', 'fixtures', 'fake-home');

vi.mock('@/lib/server/config', async () => {
  const { join } = await import('node:path');
  const CLAUDE_DIR = join(FAKE_HOME, '.claude');
  return {
    PATHS: {
      HOME: FAKE_HOME,
      CLAUDE_DIR,
      CLAUDE_PROJECTS_DIR: join(CLAUDE_DIR, 'projects'),
      CLAUDE_GLOBAL_MD: join(CLAUDE_DIR, 'CLAUDE.md'),
      CLAUDE_UI_STATE_DIR: join(CLAUDE_DIR, 'claude-ui'),
      AUDIT_LOG: join(CLAUDE_DIR, 'claude-ui', 'audit.log'),
    },
    LIMITS: {
      MAX_PTY: 16,
      PTY_SPAWN_PER_MINUTE: 10,
      REST_PER_MINUTE: 100,
      WS_MSG_PER_SECOND: 500,
      CLAUDE_MD_MAX_BYTES: 1_000_000,
      RENDERED_FIELD_MAX_BYTES: 10_000_000,
      PTY_UNACKED_MAX_BYTES: 1_000_000,
      PTY_CHUNK_BYTES: 64 * 1024,
    },
    COOKIE_NAMES: { AUTH: 'claude_ui_auth', CSRF: 'claude_ui_csrf' },
    CSRF_HEADER: 'x-csrf-token',
    getServerToken: () => 'test-token',
    getServerPort: () => 12345,
  };
});

const { listProjects, listSessions, resolveSessionPath, sessionPreview } =
  await import('@/lib/jsonl/index');

describe('listProjects (fake-home)', () => {
  it('wykrywa 5 projektów z fixture', async () => {
    const projects = await listProjects();
    expect(projects).toHaveLength(5);
    const slugs = projects.map((p) => p.slug).sort();
    expect(slugs).toEqual(['-tmp-alpha', '-tmp-beta', '-tmp-delta', '-tmp-epsilon', '-tmp-gamma']);
  });

  it('sniffuje resolvedCwd z pierwszego eventu', async () => {
    const projects = await listProjects();
    const alpha = projects.find((p) => p.slug === '-tmp-alpha');
    expect(alpha?.resolvedCwd).toBe('/tmp/alpha');
  });

  it('zlicza sesje per projekt', async () => {
    const projects = await listProjects();
    const epsilon = projects.find((p) => p.slug === '-tmp-epsilon');
    expect(epsilon?.sessionCount).toBe(3);
    const alpha = projects.find((p) => p.slug === '-tmp-alpha');
    expect(alpha?.sessionCount).toBe(2);
  });
});

describe('listSessions', () => {
  it('zwraca sesje dla valid slug, posortowane po mtime DESC', async () => {
    const sessions = await listSessions('-tmp-epsilon');
    expect(sessions).toHaveLength(3);
    expect(sessions[0]?.id).toBe('44444444-0000-4000-8000-000000000003');
  });

  it('rzuca na invalid slug', async () => {
    await expect(listSessions('../../etc')).rejects.toThrow('invalid_slug');
    await expect(listSessions('')).rejects.toThrow('invalid_slug');
    await expect(listSessions('foo/bar')).rejects.toThrow('invalid_slug');
  });
});

describe('resolveSessionPath', () => {
  it('zwraca bezpieczną ścieżkę', async () => {
    const p = await resolveSessionPath('-tmp-alpha', '00000000-0000-4000-8000-000000000001');
    expect(p).toMatch(/\-tmp-alpha\/00000000-0000-4000-8000-000000000001\.jsonl$/);
  });

  it('odrzuca path traversal w sessionId', async () => {
    await expect(resolveSessionPath('-tmp-alpha', '../../etc/passwd')).rejects.toThrow();
  });

  it('odrzuca invalid slug', async () => {
    await expect(
      resolveSessionPath('../alpha', '00000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow();
  });
});

describe('sessionPreview', () => {
  it('liczy wiadomości (pomija malformed)', async () => {
    const path = await resolveSessionPath('-tmp-alpha', '00000000-0000-4000-8000-000000000001');
    const preview = await sessionPreview(path);
    // Fixture ma 10 poprawnych linii + 1 malformed.
    expect(preview.messageCount).toBe(10);
    expect(preview.firstUserPreview).toBe('Hello there');
  });
});
