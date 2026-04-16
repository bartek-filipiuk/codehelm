'use client';

import { useMemo } from 'react';
import { useProjects, type ProjectSummary } from '@/hooks/use-projects';
import { useAliases } from '@/hooks/use-aliases';
import { useUiStore } from '@/stores/ui-slice';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { timeAgo } from '@/lib/ui/format';
import { cn } from '@/lib/utils';

export function ProjectList() {
  const { data, isLoading, isError, refetch } = useProjects();
  const { data: aliases } = useAliases();
  const search = useUiStore((s) => s.search);
  const selectedSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelected = useUiStore((s) => s.setSelectedProject);

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const alias = aliases?.[p.slug] ?? '';
      return (
        alias.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.displayPath ?? '').toLowerCase().includes(q) ||
        (p.resolvedCwd ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, aliases]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col gap-0.5 p-2" role="list">
        {filtered.map((p) => (
          <ProjectItem
            key={p.slug}
            project={p}
            alias={aliases?.[p.slug]}
            active={p.slug === selectedSlug}
            onSelect={() => setSelected(p.slug)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-neutral-500">Brak dopasowań.</li>
        )}
      </ul>
    </ScrollArea>
  );
}

function ProjectItem({
  project,
  alias,
  active,
  onSelect,
}: {
  project: ProjectSummary;
  alias: string | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const path = project.resolvedCwd ?? project.displayPath;
  const primary = alias ?? path;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        title={`${alias ? alias + '\n' : ''}${path}\nslug: ${project.slug}`}
        className={cn(
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left',
          active ? 'bg-neutral-800' : 'hover:bg-neutral-900',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {alias ? (
            <span className="text-xs font-medium text-neutral-100">{primary}</span>
          ) : (
            <span className="font-mono text-xs text-neutral-300">{primary}</span>
          )}
        </span>
        <span className="ml-2 inline-flex shrink-0 items-center gap-2 text-[10px] text-neutral-400">
          <span>{project.sessionCount}</span>
          <span>{timeAgo(project.lastActivity)}</span>
        </span>
      </button>
    </li>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 p-4 text-sm text-red-400">
      <p>Nie udało się załadować listy projektów.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Ponów
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-2 px-4 py-8 text-sm text-neutral-400">
      <p className="font-medium text-neutral-200">Brak projektów.</p>
      <p className="text-xs text-neutral-500">
        Aby zaczął się pojawiać tu lista, uruchom Claude Code w jakimś projekcie przynajmniej raz.
        Katalog <code className="rounded bg-neutral-800 px-1">~/.claude/projects/</code> zostanie
        utworzony po pierwszej sesji.
      </p>
    </div>
  );
}
