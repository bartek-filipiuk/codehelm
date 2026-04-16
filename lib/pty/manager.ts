import { randomUUID } from 'node:crypto';
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch';
import { spawnPty, type SpawnOptions } from './spawn';
import { auditPty } from './audit';
import { LIMITS } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';

export type DataListener = (chunk: string) => void;
export type ExitListener = (info: { exitCode: number; signal?: number }) => void;

export interface PtyHandle {
  id: string;
  pid: number;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  createdAt: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: DataListener): () => void;
  onExit(listener: ExitListener): () => void;
  /** Client ACK — releases `bytes` worth of unacked buffer. */
  ack(bytes: number): void;
  /** Current unacked-bytes counter (for tests). */
  readonly unacked: number;
  readonly paused: boolean;
}

interface InternalHandle extends PtyHandle {
  _pty: IPty;
  _dataListeners: Set<DataListener>;
  _exitListeners: Set<ExitListener>;
  _unacked: number;
  _paused: boolean;
  _exited: boolean;
}

class PtyManager {
  private handles = new Map<string, InternalHandle>();
  private spawnTimes: number[] = [];

  list(): Array<Pick<PtyHandle, 'id' | 'pid' | 'cwd' | 'shell' | 'cols' | 'rows' | 'createdAt'>> {
    return Array.from(this.handles.values()).map((h) => ({
      id: h.id,
      pid: h.pid,
      cwd: h.cwd,
      shell: h.shell,
      cols: h.cols,
      rows: h.rows,
      createdAt: h.createdAt,
    }));
  }

  count(): number {
    return this.handles.size;
  }

  private checkRateLimit(): void {
    const now = Date.now();
    const cutoff = now - 60_000;
    this.spawnTimes = this.spawnTimes.filter((t) => t > cutoff);
    if (this.spawnTimes.length >= LIMITS.PTY_SPAWN_PER_MINUTE) {
      throw new Error('rate_limit');
    }
  }

  async spawn(opts: SpawnOptions): Promise<PtyHandle> {
    if (this.handles.size >= LIMITS.MAX_PTY) {
      await auditPty({ action: 'reject', id: 'n/a', reason: 'cap' });
      throw new Error('pty_cap');
    }
    try {
      this.checkRateLimit();
    } catch (err) {
      await auditPty({ action: 'reject', id: 'n/a', reason: (err as Error).message });
      throw err;
    }
    this.spawnTimes.push(Date.now());

    const { pty, shell, cwd } = await spawnPty(opts);
    const id = randomUUID();
    const handle: InternalHandle = {
      id,
      pid: pty.pid,
      cwd,
      shell,
      cols: opts.cols,
      rows: opts.rows,
      createdAt: Date.now(),
      _pty: pty,
      _dataListeners: new Set(),
      _exitListeners: new Set(),
      _unacked: 0,
      _paused: false,
      _exited: false,
      get unacked() {
        return this._unacked;
      },
      get paused() {
        return this._paused;
      },
      write(data: string) {
        if (this._exited) return;
        pty.write(data);
      },
      resize(cols: number, rows: number) {
        if (this._exited) return;
        const c = Math.max(1, Math.min(cols, 400));
        const r = Math.max(1, Math.min(rows, 200));
        pty.resize(c, r);
        this.cols = c;
        this.rows = r;
      },
      kill(signal = 'SIGTERM') {
        if (this._exited) return;
        try {
          pty.kill(signal);
        } catch {
          /* ignore */
        }
      },
      onData(listener: DataListener) {
        this._dataListeners.add(listener);
        return () => this._dataListeners.delete(listener);
      },
      onExit(listener: ExitListener) {
        this._exitListeners.add(listener);
        return () => this._exitListeners.delete(listener);
      },
      ack(bytes: number) {
        this._unacked = Math.max(0, this._unacked - bytes);
        if (this._paused && this._unacked < LIMITS.PTY_UNACKED_MAX_BYTES / 2) {
          this._paused = false;
          try {
            pty.resume();
          } catch {
            /* ignore */
          }
        }
      },
    };

    pty.onData((chunk: string) => {
      handle._unacked += Buffer.byteLength(chunk, 'utf8');
      if (!handle._paused && handle._unacked > LIMITS.PTY_UNACKED_MAX_BYTES) {
        handle._paused = true;
        try {
          pty.pause();
        } catch {
          /* ignore */
        }
      }
      for (const l of handle._dataListeners) {
        try {
          l(chunk);
        } catch (err) {
          logger.warn({ err }, 'pty_data_listener_err');
        }
      }
    });

    pty.onExit(({ exitCode, signal }) => {
      handle._exited = true;
      this.handles.delete(id);
      for (const l of handle._exitListeners) {
        try {
          l({ exitCode, ...(typeof signal === 'number' ? { signal } : {}) });
        } catch (err) {
          logger.warn({ err }, 'pty_exit_listener_err');
        }
      }
      void auditPty({
        action: 'exit',
        id,
        pid: handle.pid,
        exitCode,
        ...(typeof signal === 'number' ? { signal } : {}),
      });
    });

    this.handles.set(id, handle);
    await auditPty({
      action: 'spawn',
      id,
      pid: handle.pid,
      cwd,
      shell,
      cols: opts.cols,
      rows: opts.rows,
    });
    return handle;
  }

  get(id: string): PtyHandle | undefined {
    return this.handles.get(id);
  }

  killAll(signal = 'SIGTERM'): void {
    for (const h of this.handles.values()) {
      h.kill(signal);
    }
  }
}

export const ptyManager = new PtyManager();
