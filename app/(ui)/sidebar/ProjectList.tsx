'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
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
import { isProjectGrouping, isSortMode, type SortMode } from '@/lib/ui/layout-storage';
import { groupProjectsByPrefix, type ProjectGroup } from '@/lib/projects/group-by-prefix';
import { cn } from '@/lib/utils';

const GROUP_OPEN_STORAGE_KEY = 'claude-ui:project-groups:open';

function loadGroupOpenMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GROUP_OPEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveGroupOpenMap(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GROUP_OPEN_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // swallow quota / access errors
  }
}

export function ProjectList() {
  const { data, isLoading, isError, refetch } = useProjects();
  const { data: meta } = useProjectMeta();
  const setMeta = useSetProjectMeta();
  const search = useUiStore((s) => s.search);
  const selectedSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelected = useUiStore((s) => s.setSelectedProject);
  const sortMode = useUiStore((s) => s.sortMode);
  const setSortMode = useUiStore((s) => s.setSortMode);
  const grouping = useUiStore((s) => s.projectGrouping);
  const setGrouping = useUiStore((s) => s.setProjectGrouping);

  const isGrouped = grouping === 'prefix';

  const visible = useMemo(
    () =>
      filterAndSortProjects(data ?? [], meta ?? {}, search, sortMode, {
        hoistFavorites: !isGrouped,
      }),
    [data, meta, search, sortMode, isGrouped],
  );

  const groups = useMemo<ProjectGroup[]>(
    () => (isGrouped ? groupProjectsByPrefix(visible, meta ?? {}) : []),
    [isGrouped, visible, meta],
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

  const renderItem = (p: ProjectSummary) => {
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
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 px-3 pb-1 pt-2">
        <div className="flex items-center justify-between">
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
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">View</span>
          <Select
            aria-label="Project grouping"
            value={grouping}
            onChange={(e) => {
              const next = e.target.value;
              if (isProjectGrouping(next)) setGrouping(next);
            }}
          >
            <option value="flat">Flat</option>
            <option value="prefix">By folder</option>
          </Select>
        </div>
      </div>
      {isGrouped ? (
        <GroupedProjects groups={groups} renderItem={renderItem} />
      ) : (
        <ul className="flex flex-col gap-0.5 p-2" role="list">
          {visible.map(renderItem)}
          {visible.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-neutral-500">Brak dopasowań.</li>
          )}
        </ul>
      )}
    </ScrollArea>
  );
}

function GroupedProjects({
  groups,
  renderItem,
}: {
  groups: ProjectGroup[];
  renderItem: (p: ProjectSummary) => React.ReactElement;
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => loadGroupOpenMap());

  const setOpen = useCallback((key: string, open: boolean) => {
    setOpenMap((prev) => {
      const next = { ...prev, [key]: open };
      saveGroupOpenMap(next);
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <ul className="flex flex-col gap-0.5 p-2" role="list">
        <li className="px-3 py-6 text-center text-xs text-neutral-500">Brak dopasowań.</li>
      </ul>
    );
  }

  return (
    <div className="flex flex-col p-2">
      {groups.map((group) => {
        const isOpen = openMap[group.key] !== false;
        return (
          <section key={group.key} className="flex flex-col">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(group.key, !isOpen)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] uppercase tracking-wider text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            >
              {isOpen ? (
                <ChevronDown aria-hidden className="h-3 w-3" />
              ) : (
                <ChevronRight aria-hidden className="h-3 w-3" />
              )}
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              <span className="tabular-nums text-neutral-500">{group.items.length}</span>
            </button>
            {isOpen && (
              <ul className="flex flex-col gap-0.5 pb-1 pl-1" role="list">
                {group.items.map(renderItem)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
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
  options: { hoistFavorites?: boolean } = {},
): ProjectSummary[] {
  const { hoistFavorites = true } = options;
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
    if (hoistFavorites) {
      const aFav = meta[a.slug]?.favorite === true ? 1 : 0;
      const bFav = meta[b.slug]?.favorite === true ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
    }
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
