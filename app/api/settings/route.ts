import { NextResponse, type NextRequest } from 'next/server';
import { patchSettings, readSettings, SettingsPatchSchema } from '@/lib/settings/io';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const settings = await readSettings();
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = SettingsPatchSchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }
  try {
    const settings = await patchSettings(parsed.data);
    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'settings_write_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
