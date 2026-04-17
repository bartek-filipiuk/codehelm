const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function isHostAllowed(host: string | null | undefined, expectedPort: number): boolean {
  if (!host) return false;
  const match = /^([^:[\]]+):(\d+)$/.exec(host);
  if (!match) return false;
  const [, hostname, portStr] = match;
  if (!hostname || !portStr) return false;
  if (!ALLOWED_HOSTS.has(hostname)) return false;
  return Number(portStr) === expectedPort;
}

export function isOriginAllowed(origin: string | null | undefined, expectedPort: number): boolean {
  if (!origin) return false;
  // Browsers send Origin as `scheme://host[:port]` without a trailing slash.
  // Require an exact match — no path, query, fragment, or trailing `/`.
  const accept = [`http://127.0.0.1:${expectedPort}`, `http://localhost:${expectedPort}`];
  return accept.includes(origin);
}
