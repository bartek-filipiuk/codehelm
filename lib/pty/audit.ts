import { audit as genericAudit } from '@/lib/server/audit';

/**
 * PTY-specific audit shim. Whitelists the exact fields that may be logged.
 * No env, no tokens, no stdin/stdout content — ever.
 */
export function auditPty(event: {
  action: 'spawn' | 'kill' | 'exit' | 'reject';
  id: string;
  pid?: number;
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
  reason?: string;
  exitCode?: number;
  signal?: number | string;
}): Promise<void> {
  return genericAudit({ event: `pty.${event.action}`, ...stripUndefined(event) });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
