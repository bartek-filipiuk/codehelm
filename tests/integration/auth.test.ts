import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { startServer, type StartedServer } from './helpers/start-server';

function rawRequest(
  host: string,
  port: number,
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host,
        port,
        path,
        method: 'GET',
        headers: { ...extraHeaders },
      },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ statusCode: res.statusCode ?? 0, headers: res.headers as never }),
        );
      },
    );
    req.once('error', reject);
    req.end();
  });
}

let server: StartedServer;

beforeAll(async () => {
  server = await startServer();
}, 30_000);

afterAll(async () => {
  await server.stop();
});

describe('GET /api/auth', () => {
  it('200 HTML + ustawia cookie dla poprawnego tokena', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, {
      redirect: 'manual',
    });
    // HTML redirect (not 302): Chromium --app drops cookies across 302.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    // Meta + JS redirect to bare "/" (no token in URL or body).
    expect(body).toMatch(/location\.replace\("\/"\)/);
    expect(body).not.toContain(server.token);

    const cookies = res.headers.getSetCookie();
    const auth = cookies.find((c) => c.startsWith('claude_ui_auth='));
    const csrf = cookies.find((c) => c.startsWith('claude_ui_csrf='));
    expect(auth).toBeDefined();
    expect(auth).toMatch(/HttpOnly/i);
    expect(auth).toMatch(/SameSite=lax/i);
    expect(csrf).toBeDefined();
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('401 dla złego tokena', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth?k=deadbeef`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });

  it('401 dla pustego tokena', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });
});

describe('Host allowlist', () => {
  it('403 dla Host: evil.com', async () => {
    // Node's undici fetch disallows overriding Host header for security reasons,
    // so use raw http.request which honours the Host we set.
    const res = await rawRequest('127.0.0.1', server.port, '/api/healthz', {
      Host: 'evil.com',
    });
    expect(res.statusCode).toBe(403);
  });

  it('OK dla Host: 127.0.0.1:PORT', async () => {
    const res = await fetch(`${server.baseUrl}/api/healthz`);
    expect(res.status).toBe(200);
  });

  it('OK dla Host: localhost:PORT', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/healthz`);
    expect(res.status).toBe(200);
  });
});

describe('Auth-gated endpoints', () => {
  it('401 bez cookie na nieznanym endpoincie (np. /)', async () => {
    const res = await fetch(`${server.baseUrl}/`);
    // Either 401 (jeśli strona / jest auth-gated) lub 200 zależy od tego czy / jest exempt.
    // Dla naszego setup / nie jest exempt — musi być 401.
    expect(res.status).toBe(401);
  });
});

describe('CSRF on unsafe methods', () => {
  it('403 dla POST bez CSRF, z auth cookie', async () => {
    // Najpierw zdobądź auth cookie.
    const authRes = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, {
      redirect: 'manual',
    });
    const cookies = authRes.headers
      .getSetCookie()
      .map((c) => c.split(';', 1)[0])
      .filter(Boolean)
      .join('; ');

    const res = await fetch(`${server.baseUrl}/api/does-not-exist`, {
      method: 'POST',
      headers: { Cookie: cookies },
      body: '{}',
    });
    // Middleware odrzuca na CSRF przed Next 404 handlerem.
    expect(res.status).toBe(403);
  });
});
