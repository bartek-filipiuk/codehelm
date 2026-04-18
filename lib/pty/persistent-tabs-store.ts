import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { PATHS } from '@/lib/server/config';

export const CRON_TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const PersistentTabSchema = z.object({
  persistentId: z.string().uuid(),
  title: z.string().max(80),
  cwd: z.string().min(1),
  shell: z.string().startsWith('/').optional(),
  args: z.array(z.string()).max(32).optional(),
  initCommand: z.string().max(2048).optional(),
  cronTag: z.string().regex(CRON_TAG_RE).optional(),
  /** Project slug used by the UI to group tabs. No validation here — stays
   * user-opaque. */
  projectSlug: z.string().max(256).optional(),
  /** Stable UI alias key (e.g. `resume:<sessionId>`, `shell:<slug>:<cwd>`). */
  aliasKey: z.string().max(256).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type PersistentTab = z.infer<typeof PersistentTabSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  tabs: z.array(PersistentTabSchema),
});

const FILE_PATH = join(PATHS.CODEHELM_STATE_DIR, 'persistent-tabs.json');

let mutex = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureDir(): Promise<void> {
  await mkdir(dirname(FILE_PATH), { recursive: true, mode: 0o700 });
}

async function atomicWrite(content: string): Promise<void> {
  await ensureDir();
  const tmp = `${FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => undefined);
  await rename(tmp, FILE_PATH);
}

export async function readAll(): Promise<PersistentTab[]> {
  return enqueue(async () => {
    try {
      const raw = await readFile(FILE_PATH, 'utf8');
      const parsed = FileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return [];
      return parsed.data.tabs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  });
}

async function writeAll(tabs: PersistentTab[]): Promise<void> {
  const payload = JSON.stringify({ version: 1, tabs }, null, 2);
  await atomicWrite(payload);
}

export interface CreatePersistentTabInput {
  title: string;
  cwd: string;
  shell?: string | undefined;
  args?: string[] | undefined;
  initCommand?: string | undefined;
  cronTag?: string | undefined;
  projectSlug?: string | undefined;
  aliasKey?: string | undefined;
}

export async function create(input: CreatePersistentTabInput): Promise<PersistentTab> {
  return enqueue(async () => {
    const current = await innerReadAll();
    if (input.cronTag && current.some((t) => t.cronTag === input.cronTag)) {
      throw new Error('cron_tag_taken');
    }
    const now = Date.now();
    const tab: PersistentTab = {
      persistentId: randomUUID(),
      title: input.title.trim().slice(0, 80) || 'persistent-tab',
      cwd: input.cwd,
      ...(input.shell !== undefined ? { shell: input.shell } : {}),
      ...(input.args !== undefined ? { args: input.args } : {}),
      ...(input.initCommand !== undefined ? { initCommand: input.initCommand } : {}),
      ...(input.cronTag !== undefined ? { cronTag: input.cronTag } : {}),
      ...(input.projectSlug !== undefined ? { projectSlug: input.projectSlug } : {}),
      ...(input.aliasKey !== undefined ? { aliasKey: input.aliasKey } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const parsed = PersistentTabSchema.parse(tab);
    await writeAll([...current, parsed]);
    return parsed;
  });
}

export interface UpdatePersistentTabInput {
  title?: string | undefined;
  initCommand?: string | null | undefined;
  cronTag?: string | null | undefined;
}

export async function update(
  persistentId: string,
  patch: UpdatePersistentTabInput,
): Promise<PersistentTab> {
  return enqueue(async () => {
    const current = await innerReadAll();
    const idx = current.findIndex((t) => t.persistentId === persistentId);
    if (idx === -1) throw new Error('not_found');
    const existing = current[idx];
    if (!existing) throw new Error('not_found');
    if (
      patch.cronTag !== undefined &&
      patch.cronTag !== null &&
      current.some((t) => t.persistentId !== persistentId && t.cronTag === patch.cronTag)
    ) {
      throw new Error('cron_tag_taken');
    }
    const next: PersistentTab = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 80) } : {}),
      ...(patch.initCommand !== undefined
        ? patch.initCommand === null
          ? stripKey(existing, 'initCommand')
          : { initCommand: patch.initCommand }
        : {}),
      ...(patch.cronTag !== undefined
        ? patch.cronTag === null
          ? stripKey(existing, 'cronTag')
          : { cronTag: patch.cronTag }
        : {}),
      updatedAt: Date.now(),
    };
    const parsed = PersistentTabSchema.parse(next);
    const copy = [...current];
    copy[idx] = parsed;
    await writeAll(copy);
    return parsed;
  });
}

export async function remove(persistentId: string): Promise<boolean> {
  return enqueue(async () => {
    const current = await innerReadAll();
    const next = current.filter((t) => t.persistentId !== persistentId);
    if (next.length === current.length) return false;
    await writeAll(next);
    return true;
  });
}

export async function findByCronTag(tag: string): Promise<PersistentTab | null> {
  const all = await readAll();
  return all.find((t) => t.cronTag === tag) ?? null;
}

async function innerReadAll(): Promise<PersistentTab[]> {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = FileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.tabs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function stripKey<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> {
  const { [key]: _removed, ...rest } = obj;
  void _removed;
  return rest;
}
