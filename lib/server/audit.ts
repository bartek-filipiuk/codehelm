import { appendFile, mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PATHS } from './config';

let initialized = false;

async function ensureLogFile(): Promise<void> {
  if (initialized) return;
  const dir = dirname(PATHS.AUDIT_LOG);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  initialized = true;
}

export interface AuditEvent {
  event: string;
  [key: string]: unknown;
}

/**
 * Appends a structured audit entry. Whitelisted fields only — never pass env,
 * tokens, cookies or message content. See docs/SECURITY.md §19.
 */
export async function audit(event: AuditEvent): Promise<void> {
  await ensureLogFile();
  const entry = { ts: new Date().toISOString(), ...event };
  const line = `${JSON.stringify(entry)}\n`;
  await appendFile(PATHS.AUDIT_LOG, line, { mode: 0o600 });
  await chmod(PATHS.AUDIT_LOG, 0o600).catch(() => undefined);
}
