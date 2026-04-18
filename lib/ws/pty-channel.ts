import type { WebSocket } from 'ws';
import { z } from 'zod';
import { ptyManager, type PtyHandle } from '@/lib/pty/manager';
import { persistentTabsRegistry } from '@/lib/pty/persistent-tabs-registry';
import { logger } from '@/lib/server/logger';

const SpawnMsg = z.object({
  type: z.literal('spawn'),
  csrf: z.string(),
  cwd: z.string(),
  cols: z.number().int().min(1).max(400),
  rows: z.number().int().min(1).max(200),
  shell: z.string().optional(),
  args: z.array(z.string()).max(32).optional(),
});

const AttachMsg = z.object({
  type: z.literal('attach'),
  csrf: z.string(),
  persistentId: z.string().uuid(),
  cols: z.number().int().min(1).max(400).optional(),
  rows: z.number().int().min(1).max(200).optional(),
});

const DataMsg = z.object({ type: z.literal('data'), data: z.string().max(64 * 1024) });
const ResizeMsg = z.object({
  type: z.literal('resize'),
  cols: z.number().int().min(1).max(400),
  rows: z.number().int().min(1).max(200),
});
const KillMsg = z.object({ type: z.literal('kill') });
const AckMsg = z.object({ type: z.literal('ack'), bytes: z.number().int().min(1) });
const DetachMsg = z.object({ type: z.literal('detach') });

const InboundMsg = z.discriminatedUnion('type', [
  SpawnMsg,
  AttachMsg,
  DataMsg,
  ResizeMsg,
  KillMsg,
  AckMsg,
  DetachMsg,
]);

interface Ctx {
  handle: PtyHandle | null;
  unsubData: (() => void) | null;
  unsubExit: (() => void) | null;
  /** Expected CSRF cookie value (verified against first-message csrf). */
  expectedCsrf: string;
  /** True when the handle is a persistent PTY (do not kill on WS close). */
  persistent: boolean;
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err }, 'pty_send_err');
  }
}

export function attachPtyChannel(ws: WebSocket, csrfCookieValue: string): void {
  const ctx: Ctx = {
    handle: null,
    unsubData: null,
    unsubExit: null,
    expectedCsrf: csrfCookieValue,
    persistent: false,
  };

  const cleanup = () => {
    if (ctx.unsubData) ctx.unsubData();
    if (ctx.unsubExit) ctx.unsubExit();
    ctx.unsubData = null;
    ctx.unsubExit = null;
    if (ctx.handle && !ctx.persistent) {
      ctx.handle.kill('SIGHUP');
    }
    ctx.handle = null;
    ctx.persistent = false;
  };

  ws.on('close', cleanup);
  ws.on('error', (err) => {
    logger.warn({ err }, 'pty_ws_err');
    cleanup();
  });

  ws.on('message', async (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      send(ws, { type: 'error', code: 'bad_json' });
      return;
    }
    const out = InboundMsg.safeParse(parsed);
    if (!out.success) {
      send(ws, { type: 'error', code: 'schema' });
      return;
    }
    const msg = out.data;

    if (msg.type === 'spawn') {
      if (ctx.handle) {
        send(ws, { type: 'error', code: 'already_spawned' });
        return;
      }
      if (msg.csrf !== ctx.expectedCsrf || !ctx.expectedCsrf) {
        send(ws, { type: 'error', code: 'csrf' });
        try {
          ws.close(1008, 'csrf');
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        const { cwd, cols, rows } = msg;
        const handle = await ptyManager.spawn({
          cwd,
          cols,
          rows,
          ...(msg.shell !== undefined ? { shell: msg.shell } : {}),
          ...(msg.args !== undefined ? { args: msg.args } : {}),
        });
        ctx.handle = handle;
        ctx.persistent = false;
        ctx.unsubData = handle.onData((chunk) => send(ws, { type: 'data', data: chunk }));
        ctx.unsubExit = handle.onExit(({ exitCode, signal }) =>
          send(ws, { type: 'exit', exitCode, ...(signal !== undefined ? { signal } : {}) }),
        );
        send(ws, {
          type: 'spawned',
          id: handle.id,
          pid: handle.pid,
          shell: handle.shell,
          cwd: handle.cwd,
        });
      } catch (err) {
        const code = (err as Error).message;
        send(ws, { type: 'error', code });
        if (code === 'pty_cap' || code === 'rate_limit') {
          try {
            ws.close(1013, code);
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }

    if (msg.type === 'attach') {
      if (ctx.handle) {
        send(ws, { type: 'error', code: 'already_spawned' });
        return;
      }
      if (msg.csrf !== ctx.expectedCsrf || !ctx.expectedCsrf) {
        send(ws, { type: 'error', code: 'csrf' });
        try {
          ws.close(1008, 'csrf');
        } catch {
          /* ignore */
        }
        return;
      }
      const entry = persistentTabsRegistry.getEntry(msg.persistentId);
      if (!entry) {
        logger.warn(
          {
            persistentId: msg.persistentId,
            known: persistentTabsRegistry.list().map((e) => e.tab.persistentId),
          },
          'attach_persistent_not_found',
        );
        send(ws, { type: 'error', code: 'persistent_not_found' });
        return;
      }
      const handle = ptyManager.get(entry.ptyId);
      if (!handle) {
        logger.warn(
          { persistentId: msg.persistentId, ptyId: entry.ptyId },
          'attach_pty_dead',
        );
        send(ws, { type: 'error', code: 'pty_dead' });
        return;
      }
      ctx.handle = handle;
      ctx.persistent = true;
      if (msg.cols && msg.rows) {
        try {
          handle.resize(msg.cols, msg.rows);
        } catch {
          /* ignore */
        }
      }
      ctx.unsubData = handle.onData((chunk) => send(ws, { type: 'data', data: chunk }));
      ctx.unsubExit = handle.onExit(({ exitCode, signal }) =>
        send(ws, { type: 'exit', exitCode, ...(signal !== undefined ? { signal } : {}) }),
      );
      const tail = handle.getBufferTail();
      send(ws, {
        type: 'attached',
        id: handle.id,
        pid: handle.pid,
        shell: handle.shell,
        cwd: handle.cwd,
        persistentId: entry.tab.persistentId,
        tail,
      });
      return;
    }

    if (!ctx.handle) {
      send(ws, { type: 'error', code: 'no_session' });
      return;
    }

    if (msg.type === 'data') {
      ctx.handle.write(msg.data);
    } else if (msg.type === 'resize') {
      ctx.handle.resize(msg.cols, msg.rows);
    } else if (msg.type === 'kill') {
      if (ctx.persistent) {
        send(ws, { type: 'error', code: 'kill_not_allowed_on_persistent' });
        return;
      }
      ctx.handle.kill('SIGHUP');
    } else if (msg.type === 'detach') {
      if (ctx.unsubData) ctx.unsubData();
      if (ctx.unsubExit) ctx.unsubExit();
      ctx.unsubData = null;
      ctx.unsubExit = null;
      ctx.handle = null;
      ctx.persistent = false;
      send(ws, { type: 'detached' });
    } else if (msg.type === 'ack') {
      ctx.handle.ack(msg.bytes);
    }
  });
}
