import * as nodePty from '@homebridge/node-pty-prebuilt-multiarch';
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch';
import { assertInside } from '@/lib/security/path-guard';
import { PATHS } from '@/lib/server/config';

export interface SpawnOptions {
  cwd: string;
  cols: number;
  rows: number;
  /** Override shell; defaults to $SHELL or /bin/bash. */
  shell?: string;
  /** Extra args passed after the shell binary. */
  args?: string[];
}

export interface SpawnedPty {
  pty: IPty;
  shell: string;
  cwd: string;
}

function resolveShell(override?: string): string {
  const candidate = override ?? process.env['SHELL'] ?? '/bin/bash';
  if (!candidate.startsWith('/')) return '/bin/bash';
  return candidate;
}

/**
 * Safely spawns a PTY. `cwd` must resolve inside $HOME; unresolved or escaping
 * paths throw. Env is inherited from the parent (user's shell ergonomics),
 * but callers MUST NOT persist env to audit logs.
 */
export async function spawnPty(opts: SpawnOptions): Promise<SpawnedPty> {
  const cwd = await assertInside(PATHS.HOME, opts.cwd);
  const shell = resolveShell(opts.shell);
  const pty = nodePty.spawn(shell, opts.args ?? [], {
    name: 'xterm-256color',
    cols: Math.max(1, Math.min(opts.cols, 400)),
    rows: Math.max(1, Math.min(opts.rows, 200)),
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
  });
  return { pty, shell, cwd };
}
