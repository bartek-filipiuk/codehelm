import { type NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolveSessionPath } from '@/lib/jsonl/index';
import { parseJsonlStream } from '@/lib/jsonl/parser';
import { sessionToMarkdown } from '@/lib/jsonl/export-md';
import { isValidSlug } from '@/lib/jsonl/slug';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('slug') ?? '';

  if (!isValidSlug(slug)) {
    return Response.json({ error: 'invalid_slug' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    return Response.json({ error: 'invalid_session_id' }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = await resolveSessionPath(slug, id);
    const st = await stat(filePath);
    if (!st.isFile()) throw new Error('not_a_file');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'session_export_resolve_failed');
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const events: JsonlEvent[] = [];
  const stream = createReadStream(filePath);
  for await (const ev of parseJsonlStream(stream, { logMalformed: false })) {
    events.push(ev);
    if (events.length > 50_000) break; // safety cap
  }

  const md = sessionToMarkdown(events, { sessionId: id, projectSlug: slug });
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}.md"`,
      'Cache-Control': 'no-store',
    },
  });
}
