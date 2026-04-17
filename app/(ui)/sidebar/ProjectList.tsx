'use client';

import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { useProjects, type ProjectSummary } from '@/hooks/use-projects';
import {
  useProjectMeta,
  useSetProjectMeta,
  type ProjectMetaMap,
} from '@/hooks/use-project-meta';
import { useSessions } from '@/hooks/use-sessions';
import { useUiStore } from '@/stores/ui-slice';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { timeAgo } from '@/lib/ui/format';
import { formatUsd } from '@/lib/jsonl/usage';
import { isSortMode, type SortMode } from '@/lib/ui/layout-storage';
import { cn } from '@/lib/utils';

export function ProjectList() {
  const { data, isLoading, isError, refetch } = useProjects();
  const { data: meta } = useProjectMeta();
  const setMeta = useSetProjectMeta();
  const search = useUiStore((s) => s.search);
  const selectedSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelected = useUiStore((s) => s.setSelectedProject);
  const sortMode = useUiStore((s) => s.sortMode);
  const setSortMode = useUiStore((s) => s.setSortMode);

  const visible = useMemo(
    () => filterAndSortProjects(data ?? [], meta ?? {}, search, sortMode),
    [data, meta, search, sortMode],
  );

  const { data: selectedSessions } = useSessions(selectedSlug);
  const selectedCost = useMemo(() => {
    if (!selectedSessions || selectedSessions.length === 0) return null;
    let total = 0;
    let seen = false;
    for (const s of selectedSessions) {
      if (typeof s.costUsd === 'number' && Number.isFinite(s.costUsd)) {
        total += s.costUsd;
        seen = true;
      }
    }
    return seen ? total : null;
  }, [selectedSessions]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ScrollArea className="h-full">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Sortuj</span>
        <Select
          aria-label="Sortowanie projektów"
          value={sortMode}
          onChange={(e) => {
            const next = e.target.value;
            if (isSortMode(next)) setSortMode(next);
          }}
        >
          <option value="activity">Ostatnia aktywność</option>
          <option value="name">Nazwa</option>
          <option value="sessions">Liczba sesji</option>
        </Select>
      </div>
      <ul className="flex flex-col gap-0.5 p-2" role="list">
        {visible.map((p) => {
          const entry = meta?.[p.slug];
          const isActive = p.slug === selectedSlug;
          return (
            <ProjectItem
              key={p.slug}
              project={p}
              alias={entry?.alias}
              favorite={entry?.favorite === true}
              active={isActive}
              costUsd={isActive ? selectedCost : null}
              onSelect={() => setSelected(p.slug)}
              onToggleFavorite={() => {
                setMeta.mutate({
                  slug: p.slug,
                  favorite: entry?.favorite !== true,
                });
              }}
            />
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-neutral-500">Brak dopasowań.</li>
        )}
      </ul>
    </ScrollArea>
  );
}

function projectSortName(project: ProjectSummary, meta: ProjectMetaMap): string {
  const alias = meta[project.slug]?.alias;
  if (alias) return alias;
  return project.resolvedCwd ?? project.displayPath ?? project.slug;
}

export function filterAndSortProjects(
  projects: ProjectSummary[],
  meta: ProjectMetaMap,
  search: string,
  sortMode: SortMode = 'activity',
): ProjectSummary[] {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => {
        const alias = meta[p.slug]?.alias ?? '';
        return (
          alias.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.displayPath ?? '').toLowerCase().includes(q) ||
          (p.resolvedCwd ?? '').toLowerCase().includes(q)
        );
      })
    : projects.slice();
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  filtered.sort((a, b) => {
    const aFav = meta[a.slug]?.favorite === true ? 1 : 0;
    const bFav = meta[b.slug]?.favorite === true ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    if (sortMode === 'name') {
      return collator.compare(projectSortName(a, meta), projectSortName(b, meta));
    }
    if (sortMode === 'sessions') {
      if (a.sessionCount !== b.sessionCount) return b.sessionCount - a.sessionCount;
    }
    const aTs = a.lastActivity ? Date.parse(a.lastActivity) : 0;
    const bTs = b.lastActivity ? Date.parse(b.lastActivity) : 0;
    return bTs - aTs;
  });
  return filtered;
}

function ProjectItem({
  project,
  alias,
  favorite,
  active,
  costUsd,
  onSelect,
  onToggleFavorite,
}: {
  project: ProjectSummary;
  alias: string | undefined;
  favorite: boolean;
  active: boolean;
  costUsd: number | null;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const path = project.resolvedCwd ?? project.displayPath;
  const primary = alias ?? path;
  const tooltipBase = `${alias ? alias + '\n' : ''}${path}\nslug: ${project.slug}`;
  const tooltip = costUsd !== null ? `${tooltipBase}\nszacowany koszt: ${formatUsd(costUsd)}` : tooltipBase;
  return (
    <li
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-md pr-1',
        active ? 'bg-neutral-800' : 'hover:bg-neutral-900',
      )}
    >
      <button
        type="button"
        aria-label={favorite ? 'Odepnij projekt' : 'Przypnij projekt'}
        aria-pressed={favorite}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-yellow-300',
          favorite && 'text-yellow-300',
        )}
        title={favorite ? 'Odepnij projekt' : 'Przypnij projekt'}
      >
        <Star
          aria-hidden
          className="h-3.5 w-3.5"
          fill={favorite ? 'currentColor' : 'none'}
          strokeWidth={1.75}
        />
      </button>
      <button
        type="button"
        onClick={onSelect}
        title={tooltip}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pl-1 pr-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate">
          {alias ? (
            <span className="text-xs font-medium text-neutral-100">{primary}</span>
          ) : (
            <span className="font-mono text-xs text-neutral-300">{primary}</span>
          )}
        </span>
        <span className="ml-2 inline-flex shrink-0 items-center gap-2 text-[10px] text-neutral-400">
          {costUsd !== null && <span className="tabular-nums">{formatUsd(costUsd)}</span>}
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
