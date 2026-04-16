import { readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { assertInside } from '@/lib/security/path-guard';
import { PATHS } from '@/lib/server/config';
import { parseJsonlStream } from './parser';
import { createReadStream } from 'node:fs';
import { isValidSlug, decodeSlugToDisplayPath } from './slug';

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export interface ProjectSummary {
  slug: string;
  displayPath: string;
  resolvedCwd: string | null;
  sessionCount: number;
  lastActivity: string | null;
  totalBytes: number;
}

export interface SessionSummary {
  id: string;
  path: string;
  size: number;
  mtime: string;
  messageCount: number | null;
  firstUserPreview: string | null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(PATHS.CLAUDE_PROJECTS_DIR);
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const name of entries) {
    if (!isValidSlug(name)) continue;
    const dir = join(PATHS.CLAUDE_PROJECTS_DIR, name);
    let st;
    try {
      st = await stat(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const sessions = await collectSessionFiles(dir);
    const resolvedCwd = await sniffResolvedCwd(sessions[0]?.path ?? null);
    out.push({
      slug: name,
      displayPath: resolvedCwd ?? decodeSlugToDisplayPath(name),
      resolvedCwd,
      sessionCount: sessions.length,
      lastActivity: sessions[0]?.mtime ?? null,
      totalBytes: sessions.reduce((acc, s) => acc + s.size, 0),
    });
  }
  out.sort((a, b) => {
    const am = a.lastActivity ?? '';
    const bm = b.lastActivity ?? '';
    return bm.localeCompare(am);
  });
  return out;
}

export async function listSessions(slug: string): Promise<SessionSummary[]> {
  if (!isValidSlug(slug)) throw new Error('invalid_slug');
  const dir = join(PATHS.CLAUDE_PROJECTS_DIR, slug);
  await assertInside(PATHS.CLAUDE_PROJECTS_DIR, dir);
  const sessions = await collectSessionFiles(dir);
  return sessions;
}

export async function resolveSessionPath(slug: string, sessionId: string): Promise<string> {
  if (!isValidSlug(slug)) throw new Error('invalid_slug');
  if (!/^[0-9a-f-]+$/i.test(sessionId)) throw new Error('invalid_session_id');
  const target = join(PATHS.CLAUDE_PROJECTS_DIR, slug, `${sessionId}.jsonl`);
  return await assertInside(PATHS.CLAUDE_PROJECTS_DIR, target);
}

async function collectSessionFiles(dir: string): Promise<SessionSummary[]> {
  let items: string[];
  try {
    items = await readdir(dir);
  } catch {
    return [];
  }
  const out: SessionSummary[] = [];
  for (const name of items) {
    if (!SESSION_ID_RE.test(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({
      id: basename(name, '.jsonl'),
      path: full,
      size: st.size,
      mtime: st.mtime.toISOString(),
      messageCount: null,
      firstUserPreview: null,
    });
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

async function sniffResolvedCwd(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  try {
    const stream = createReadStream(filePath, { encoding: 'utf8', end: 4096 });
    for await (const ev of parseJsonlStream(stream, { logMalformed: false })) {
      if (typeof ev.cwd === 'string' && ev.cwd.startsWith('/')) return ev.cwd;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function sessionPreview(
  filePath: string,
): Promise<Pick<SessionSummary, 'messageCount' | 'firstUserPreview'>> {
  let messageCount = 0;
  let firstUserPreview: string | null = null;
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  for await (const ev of parseJsonlStream(stream, { logMalformed: false })) {
    messageCount++;
    if (!firstUserPreview && ev.type === 'user') {
      const content = ev.message.content;
      firstUserPreview = typeof content === 'string' ? content.slice(0, 160) : null;
    }
    if (messageCount > 2000) break;
  }
  return { messageCount, firstUserPreview };
}
