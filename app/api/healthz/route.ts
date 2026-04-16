import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    uptime: process.uptime(),
    memory_mb: Math.round(process.memoryUsage().rss / 1_048_576),
  });
}
