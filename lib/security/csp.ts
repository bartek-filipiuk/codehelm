import { randomBytes } from 'node:crypto';

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export function makeCsp(nonce: string): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [`'nonce-${nonce}'`, "'strict-dynamic'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'ws:', 'wss:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}
