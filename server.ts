import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { getServerPort, getServerToken } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';
import { runMiddleware } from '@/lib/server/middleware';

const dev = process.env['NODE_ENV'] !== 'production';

async function main(): Promise<void> {
  const port = getServerPort();
  // Force early throw if token missing, before binding.
  getServerToken();

  const app = next({ dev, hostname: '127.0.0.1', port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (runMiddleware(req, res)) return;
    const parsed = parse(req.url ?? '/', true);
    handle(req, res, parsed).catch((err) => {
      logger.error({ err }, 'next_handler_error');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    });
  });

  // WS upgrade router will attach in phase 4. For now, gently close non-HMR upgrades.
  httpServer.on('upgrade', (req, socket) => {
    const url = req.url ?? '';
    if (url.startsWith('/_next/')) return; // Next HMR handles its own
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen({ port, host: '127.0.0.1' }, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  logger.info({ port }, 'claude_ui_ready');

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting_down');
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
