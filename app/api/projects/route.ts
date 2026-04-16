import { NextResponse } from 'next/server';
import { listProjects } from '@/lib/jsonl/index';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    logger.error({ err }, 'projects_list_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
