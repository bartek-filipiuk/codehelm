import type { IncomingMessage, ServerResponse } from 'node:http';
import { isHostAllowed } from '@/lib/security/host-check';
import { safeCompare } from '@/lib/security/token';
import { verifyCsrf } from '@/lib/security/csrf';
import { COOKIE_NAMES, CSRF_HEADER, getServerPort, getServerToken } from './config';
import { logger } from './logger';

const AUTH_EXEMPT = new Set<string>(['/api/auth', '/api/healthz']);
const HMR_PREFIX = '/_next/';

export interface MiddlewareContext {
  nonce: string;
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out.set(key, value);
  }
  return out;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function isSafeMethod(method: string | undefined): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function isAuthExempt(path: string): boolean {
  if (AUTH_EXEMPT.has(path)) return true;
  if (path.startsWith(HMR_PREFIX)) return true;
  if (path === '/favicon.ico') return true;
  return false;
}

/**
 * Middleware pipeline. Returns true if the request was handled (404/403/etc).
 * Returns false if the caller should continue to the Next handler.
 */
export function runMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url ?? '/';
  const path = url.split('?', 1)[0] ?? '/';
  const port = getServerPort();

  // Host check (DNS rebinding guard).
  if (!isHostAllowed(req.headers.host, port)) {
    logger.warn({ host: req.headers.host, path }, 'host_denied');
    writeJson(res, 403, { error: 'forbidden_host' });
    return true;
  }

  if (isAuthExempt(path)) return false;

  // Auth cookie check.
  const cookies = parseCookies(req.headers.cookie);
  const authCookie = cookies.get(COOKIE_NAMES.AUTH);
  const serverToken = getServerToken();
  if (!authCookie || !safeCompare(authCookie, serverToken)) {
    logger.warn({ path }, 'auth_missing_or_invalid');
    writeJson(res, 401, { error: 'unauthorized' });
    return true;
  }

  // CSRF check for unsafe methods.
  if (!isSafeMethod(req.method)) {
    const csrfCookie = cookies.get(COOKIE_NAMES.CSRF) ?? null;
    const csrfHeader =
      typeof req.headers[CSRF_HEADER] === 'string' ? (req.headers[CSRF_HEADER] as string) : null;
    if (!verifyCsrf(csrfCookie, csrfHeader)) {
      logger.warn({ path, method: req.method }, 'csrf_denied');
      writeJson(res, 403, { error: 'csrf_denied' });
      return true;
    }
  }

  return false;
}
