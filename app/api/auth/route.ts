import { NextResponse, type NextRequest } from 'next/server';
import { safeCompare } from '@/lib/security/token';
import { issueCsrf } from '@/lib/security/csrf';
import { COOKIE_NAMES, getServerToken } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const candidate = req.nextUrl.searchParams.get('k') ?? '';
  const serverToken = getServerToken();

  if (!safeCompare(candidate, serverToken)) {
    logger.warn({ path: '/api/auth' }, 'auth_token_mismatch');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const csrf = issueCsrf();
  // Redirect to bare "/" so the token never lands in history/referer.
  const redirectTo = new URL('/', req.nextUrl);
  const res = NextResponse.redirect(redirectTo, 302);
  res.cookies.set(COOKIE_NAMES.AUTH, serverToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false, // lokalne HTTP na 127.0.0.1
    path: '/',
  });
  res.cookies.set(COOKIE_NAMES.CSRF, csrf.cookie, {
    httpOnly: false, // JS must read it to set header
    sameSite: 'strict',
    secure: false,
    path: '/',
  });
  return res;
}
