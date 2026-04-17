'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dismissToast, toastInfo, toastSuccess } from '@/lib/ui/toast';

const WS_TOAST_ID = 'ws-watch-status';

type ServerEvent =
  | { kind: 'project-added'; slug: string }
  | { kind: 'session-added'; slug: string; sessionId: string }
  | { kind: 'session-updated'; slug: string; sessionId: string };

interface Payload {
  type: 'ready' | 'events';
  events?: ServerEvent[];
}

/**
 * Opens /api/ws/watch and translates server events into TanStack Query cache
 * invalidations. Reconnects with exponential backoff so temporary network
 * blips (dev server restart, WS drop) recover on their own.
 */
export function useWatch(): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let hadDrop = false;
    let everOpened = false;

    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    };

    const open = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/api/ws/watch`);
      ws.onopen = () => {
        attempt = 0;
        if (hadDrop) {
          hadDrop = false;
          dismissToast(WS_TOAST_ID);
          toastSuccess('Połączenie odzyskane', { id: WS_TOAST_ID });
        }
        everOpened = true;
      };
      ws.onmessage = (ev) => {
        let msg: Payload | null = null;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as Payload;
        } catch {
          return;
        }
        if (!msg || msg.type !== 'events' || !msg.events) return;
        const invalidatedProjects = new Set<string>();
        for (const e of msg.events) {
          if (e.kind === 'project-added') {
            void qc.invalidateQueries({ queryKey: ['projects'] });
          } else if (e.kind === 'session-added' || e.kind === 'session-updated') {
            if (!invalidatedProjects.has(e.slug)) {
              invalidatedProjects.add(e.slug);
              void qc.invalidateQueries({ queryKey: ['sessions', e.slug] });
            }
            if (e.kind === 'session-added') {
              void qc.invalidateQueries({ queryKey: ['projects'] });
            }
          }
        }
      };
      ws.onclose = () => {
        ws = null;
        if (everOpened && !cancelled && !hadDrop) {
          hadDrop = true;
          toastInfo('Utracono połączenie — ponowne łączenie…', {
            id: WS_TOAST_ID,
            duration: 10_000,
          });
        }
        schedule();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close(1000);
      } catch {
        /* ignore */
      }
    };
  }, [qc]);
}
