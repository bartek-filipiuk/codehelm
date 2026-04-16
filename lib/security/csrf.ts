import { generateToken, safeCompare } from './token';

export interface CsrfPair {
  cookie: string;
  header: string;
}

export function issueCsrf(): CsrfPair {
  const token = generateToken();
  return { cookie: token, header: token };
}

export function verifyCsrf(
  cookieValue: string | null | undefined,
  headerValue: string | null | undefined,
): boolean {
  if (!cookieValue || !headerValue) return false;
  return safeCompare(cookieValue, headerValue);
}
