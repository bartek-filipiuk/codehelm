import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createPersistentTab, listPersistentTabs } from '@/lib/pty/persistent-tabs-service';
import { CRON_TAG_RE } from '@/lib/pty/persistent-tabs-store';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  title: z.string().min(1).max(80),
  cwd: z.string().min(1),
  shell: z.string().startsWith('/').optional(),
  args: z.array(z.string()).max(32).optional(),
  initCommand: z.string().max(2048).optional(),
  cronTag: z.string().regex(CRON_TAG_RE).optional(),
  projectSlug: z.string().max(256).optional(),
  aliasKey: z.string().max(256).optional(),
});

export async function GET(): Promise<NextResponse> {
  const tabs = await listPersistentTabs();
  return NextResponse.json({ tabs }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = CreateBody.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await createPersistentTab(parsed.data);
    logger.info(
      {
        persistentId: result.tab.persistentId,
        ptyId: result.ptyId,
        cwd: result.tab.cwd,
      },
      'persistent_tab_created',
    );
    return NextResponse.json({ tab: result.tab, ptyId: result.ptyId }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'cron_tag_taken') {
      return NextResponse.json({ error: 'cron_tag_taken' }, { status: 409 });
    }
    logger.error({ err: msg, input: parsed.data }, 'persistent_tab_create_failed');
    return NextResponse.json({ error: 'internal', detail: msg }, { status: 500 });
  }
}
