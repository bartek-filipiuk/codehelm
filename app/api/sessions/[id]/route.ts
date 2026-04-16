import { type NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolveSessionPath } from '@/lib/jsonl/index';
import { isValidSlug } from '@/lib/jsonl/slug';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

/**
 * Streams the raw JSONL file so the client parses progressively.
 * Requires `?slug=<projectSlug>` because the sessionId alone does not locate
 * the file (Claude Code nests it under the project dir).
 */
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
    logger.warn({ err: (err as Error).message, slug, id }, 'session_resolve_failed');
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const nodeStream = createReadStream(filePath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buf));
      });
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'Transfer-Encoding': 'chunked',
    },
  });
}
