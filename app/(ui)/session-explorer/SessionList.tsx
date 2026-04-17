'use client';

import { useSessions, type SessionSummary } from '@/hooks/use-sessions';
import { useUiStore } from '@/stores/ui-slice';
import { useOpenSession } from '@/hooks/use-open-session';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { timeAgo, formatBytes } from '@/lib/ui/format';
import { formatUsd } from '@/lib/jsonl/usage';
import { cn } from '@/lib/utils';

export function SessionList() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const selectedId = useUiStore((s) => s.selectedSessionId);
  const setSelected = useUiStore((s) => s.setSelectedSession);
  const { data, isLoading, isError, refetch } = useSessions(slug);
  const openSession = useOpenSession();

  if (!slug) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        Pick a project from the list on the left.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-red-400">
        <p>Failed to load sessions.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 p-6 text-sm text-neutral-500">
        <p>No sessions in this project yet.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openSession.mutate({ slug })}
          disabled={openSession.isPending}
        >
          + New claude session
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">
          {data.length} sessions
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openSession.mutate({ slug })}
          disabled={openSession.isPending}
        >
          + claude
        </Button>
      </div>
      <ul className="flex flex-col gap-2 p-4 pt-2" role="list">
        {data.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            active={s.id === selectedId}
            onSelect={() => setSelected(s.id)}
            onOpenTerminal={() => openSession.mutate({ slug, resumeSessionId: s.id })}
            openPending={openSession.isPending}
          />
        ))}
      </ul>
    </ScrollArea>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
  onOpenTerminal,
  openPending,
}: {
  session: SessionSummary;
  active: boolean;
  onSelect: () => void;
  onOpenTerminal: () => void;
  openPending: boolean;
}) {
  return (
    <li>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 p-3 transition-colors hover:border-neutral-700',
          active && 'border-neutral-500 bg-neutral-900',
        )}
      >
        <button type="button" onClick={onSelect} className="flex flex-col gap-1 text-left">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-neutral-400">
              {session.id.slice(0, 8)}…
            </span>
            <span className="text-[11px] text-neutral-500">{timeAgo(session.mtime)}</span>
          </div>
          {session.firstUserPreview && (
            <p className="line-clamp-2 text-sm text-neutral-200">{session.firstUserPreview}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <span>{session.messageCount ?? '—'} messages</span>
            <span>•</span>
            <span>{formatBytes(session.size)}</span>
            {session.costUsd !== null && (
              <>
                <span>•</span>
                <span title="Estimated cost" className="tabular-nums text-neutral-400">
                  {formatUsd(session.costUsd)}
                </span>
              </>
            )}
          </div>
        </button>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTerminal();
            }}
            disabled={openPending}
            className="text-xs"
          >
            ▶ resume in terminal
          </Button>
        </div>
      </div>
    </li>
  );
}
