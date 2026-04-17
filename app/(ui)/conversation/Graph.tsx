'use client';

import { lazy, Suspense } from 'react';
import { useSessionStream } from '@/hooks/use-session-stream';
import { useUiStore } from '@/stores/ui-slice';
import { Skeleton } from '@/components/ui/skeleton';

const GraphFlow = lazy(() => import('./GraphFlow').then((m) => ({ default: m.GraphFlow })));

export function Graph() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const { events, loading, error } = useSessionStream(slug, sessionId);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        Wybierz sesję z listy.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-red-300">
        Błąd: {error}
      </div>
    );
  }

  if (loading && events.length === 0) {
    return (
      <div className="flex h-full flex-col gap-2 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
          Ładowanie grafu…
        </div>
      }
    >
      <GraphFlow events={events} />
    </Suspense>
  );
}
