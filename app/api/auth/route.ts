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
  // HTTP 302 with Set-Cookie does NOT reliably persist cookies across
  // Chromium's initial `--app=URL` navigation — the follow-up request to "/"
  // sometimes arrives cookieless regardless of SameSite. Instead: return a
  // 200 HTML document (which ALWAYS commits cookies) and do the redirect
  // from JS, so the "/" request is a same-origin in-page navigation.
  // Security: CSRF is still gated by double-submit + Host allowlist + Origin.
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex,nofollow">' +
    '<meta http-equiv="refresh" content="0;url=/">' +
    '<title>claude-ui</title></head>' +
    '<body><script>window.location.replace("/");</script></body></html>';
  const res = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
  res.cookies.set(COOKIE_NAMES.AUTH, serverToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
  res.cookies.set(COOKIE_NAMES.CSRF, csrf.cookie, {
    httpOnly: false,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
  return res;
}
