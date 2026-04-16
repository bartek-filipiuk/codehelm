import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = process.env['HOME'] ?? homedir();
const CLAUDE_DIR = join(HOME, '.claude');

export const PATHS = {
  HOME,
  CLAUDE_DIR,
  CLAUDE_PROJECTS_DIR: join(CLAUDE_DIR, 'projects'),
  CLAUDE_GLOBAL_MD: join(CLAUDE_DIR, 'CLAUDE.md'),
  CLAUDE_UI_STATE_DIR: join(CLAUDE_DIR, 'claude-ui'),
  AUDIT_LOG: join(CLAUDE_DIR, 'claude-ui', 'audit.log'),
} as const;

export const LIMITS = {
  MAX_PTY: 16,
  PTY_SPAWN_PER_MINUTE: 10,
  REST_PER_MINUTE: 100,
  WS_MSG_PER_SECOND: 500,
  CLAUDE_MD_MAX_BYTES: 1_000_000, // 1 MB
  RENDERED_FIELD_MAX_BYTES: 10_000_000, // 10 MB
  PTY_UNACKED_MAX_BYTES: 1_000_000, // 1 MB
  PTY_CHUNK_BYTES: 64 * 1024, // 64 kB
} as const;

export const COOKIE_NAMES = {
  AUTH: 'claude_ui_auth',
  CSRF: 'claude_ui_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';

export function getServerToken(): string {
  const token = process.env['CLAUDE_UI_TOKEN'];
  if (!token) {
    throw new Error('CLAUDE_UI_TOKEN env var not set. Start via bin/claude-ui.');
  }
  return token;
}

export function getServerPort(): number {
  const raw = process.env['PORT'];
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT env var: ${raw}`);
  }
  return port;
}
