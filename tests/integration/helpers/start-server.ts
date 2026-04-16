import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');

export interface StartedServer {
  port: number;
  token: string;
  baseUrl: string;
  stop: () => Promise<void>;
}

function pickPort(): Promise<number> {
  return new Promise((resolveFn, rejectFn) => {
    const s = createServer();
    s.once('error', rejectFn);
    s.listen({ port: 0, host: '127.0.0.1' }, () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        s.close(() => resolveFn(port));
      } else {
        s.close(() => rejectFn(new Error('cannot obtain port')));
      }
    });
  });
}

function waitHealth(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveFn, rejectFn) => {
    const tick = () => {
      if (Date.now() > deadline) {
        rejectFn(new Error('health timeout'));
        return;
      }
      const req = request(
        { host: '127.0.0.1', port, path: '/api/healthz', method: 'GET' },
        (res) => {
          if (res.statusCode === 200) {
            res.resume();
            resolveFn();
          } else {
            res.resume();
            setTimeout(tick, 150);
          }
        },
      );
      req.once('error', () => setTimeout(tick, 150));
      req.setTimeout(500, () => req.destroy());
      req.end();
    };
    tick();
  });
}

export async function startServer(extraEnv: Record<string, string> = {}): Promise<StartedServer> {
  const port = await pickPort();
  const token = randomBytes(32).toString('hex');
  const child: ChildProcess = spawn('pnpm', ['exec', 'tsx', 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      CLAUDE_UI_TOKEN: token,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitHealth(port);
  } catch (err) {
    child.kill('SIGKILL');
    throw err;
  }
  return {
    port,
    token,
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise<void>((resolveFn) => {
        child.once('exit', () => resolveFn());
        setTimeout(() => {
          child.kill('SIGKILL');
          resolveFn();
        }, 3000).unref();
      });
    },
  };
}
