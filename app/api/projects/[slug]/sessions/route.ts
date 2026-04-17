import { NextResponse, type NextRequest } from 'next/server';
import { listSessions, sessionPreview } from '@/lib/jsonl/index';
import { isValidSlug } from '@/lib/jsonl/slug';
import { readSettings } from '@/lib/settings/io';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  try {
    const sessions = await listSessions(slug);
    const { modelPricing } = await readSettings();
    // Enrich top 20 with preview (bounded to avoid IO storm).
    const enriched = await Promise.all(
      sessions.map(async (s, idx) => {
        if (idx >= 20) return s;
        const preview = await sessionPreview(s.path, modelPricing);
        return { ...s, ...preview };
      }),
    );
    return NextResponse.json({ sessions: enriched }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal';
    if (msg === 'invalid_slug') {
      return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
    }
    logger.error({ err, slug }, 'sessions_list_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
