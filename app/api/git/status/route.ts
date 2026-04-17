import { NextResponse, type NextRequest } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { assertInside } from '@/lib/security/path-guard';
import { PATHS } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const exec = promisify(execFile);
const TIMEOUT_MS = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_CAP = 30;
const callLog: number[] = [];

function rateLimited(now: number): boolean {
  while (callLog.length > 0 && now - callLog[0]! > RATE_WINDOW_MS) {
    callLog.shift();
  }
  if (callLog.length >= RATE_CAP) return true;
  callLog.push(now);
  return false;
}

/**
 * One-shot git status for the terminal header badge. Never polls.
 * Path-guarded to $HOME; never invokes a shell; hard 2 s timeout per
 * git call. Non-repo cwds return { branch: null, dirty: false } with 200.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cwd = req.nextUrl.searchParams.get('cwd');
  if (!cwd) return NextResponse.json({ error: 'missing_cwd' }, { status: 400 });

  if (rateLimited(Date.now())) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let safeCwd: string;
  try {
    safeCwd = await assertInside(PATHS.HOME, cwd);
  } catch {
    return NextResponse.json({ error: 'cwd_outside_home' }, { status: 403 });
  }

  try {
    const st = await stat(safeCwd);
    if (!st.isDirectory()) {
      return NextResponse.json({ error: 'not_a_directory' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'cwd_missing' }, { status: 400 });
  }

  const opts = { cwd: safeCwd, timeout: TIMEOUT_MS, windowsHide: true } as const;

  let branch: string | null = null;
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts);
    const trimmed = stdout.trim();
    branch = trimmed.length > 0 && trimmed !== 'HEAD' ? trimmed : null;
  } catch (err) {
    const code = (err as { code?: string | number }).code;
    if (code === 'ETIMEDOUT') {
      logger.warn({ cwd: safeCwd }, 'git_status_timeout_head');
      return NextResponse.json({ error: 'timeout' }, { status: 504 });
    }
    // Not a repo, or git missing. Both surface as a non-repo response.
    return NextResponse.json({ branch: null, dirty: false }, { headers: noStore() });
  }

  let dirty = false;
  try {
    const { stdout } = await exec(
      'git',
      ['status', '--porcelain', '-z', '--untracked-files=no'],
      opts,
    );
    dirty = stdout.length > 0;
  } catch (err) {
    const code = (err as { code?: string | number }).code;
    if (code === 'ETIMEDOUT') {
      logger.warn({ cwd: safeCwd }, 'git_status_timeout_porcelain');
      return NextResponse.json({ error: 'timeout' }, { status: 504 });
    }
    // Fall through — branch is known, treat dirty as false on porcelain error.
  }

  return NextResponse.json({ branch, dirty }, { headers: noStore() });
}

function noStore(): Record<string, string> {
  return { 'Cache-Control': 'no-store' };
}
