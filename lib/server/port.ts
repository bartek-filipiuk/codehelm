import { createServer } from 'node:net';

const MIN_EPHEMERAL = 49152;
const MAX_EPHEMERAL = 65535;

/**
 * Finds a free ephemeral port on 127.0.0.1.
 * Returns the port number — NOTE there is an inherent TOCTOU between close()
 * and the caller's listen(). The main server treats EADDRINUSE at bind time
 * as fatal and retries by re-invoking this function.
 */
export async function findEphemeralPort(maxAttempts = 20): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = pickRandom();
    const ok = await tryBind(port);
    if (ok) return port;
  }
  // Fallback: let OS pick one.
  return await osAssigned();
}

function pickRandom(): number {
  const range = MAX_EPHEMERAL - MIN_EPHEMERAL;
  return MIN_EPHEMERAL + Math.floor(Math.random() * range);
}

function tryBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => resolve(true));
    });
  });
}

function osAssigned(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port: 0, host: '127.0.0.1' }, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not obtain port from OS')));
      }
    });
  });
}
