'use client';

import { useMemo, useState } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import {
  computeSessionStats,
  formatDuration,
  formatTokens,
  type SessionStats,
} from '@/lib/jsonl/stats';
import { cn } from '@/lib/utils';

interface StatsBarProps {
  events: JsonlEvent[];
}

function summarizeTopTools(stats: SessionStats): string {
  if (stats.toolCounts.length === 0) return '';
  return stats.toolCounts
    .slice(0, 5)
    .map((t) => `${t.name}(${t.count})`)
    .join(' ');
}

export function StatsBar({ events }: StatsBarProps) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => computeSessionStats(events), [events]);

  const duration = formatDuration(stats.durationMs);
  const topTools = summarizeTopTools(stats);
  const tokenSummary = stats.totalTokens > 0 ? `${formatTokens(stats.totalTokens)} tokenów` : null;
  const summaryParts = [
    duration,
    `${stats.eventCount} zdarzeń`,
    tokenSummary,
    topTools || null,
  ].filter((p): p is string => Boolean(p));

  return (
    <div
      className="border-b border-neutral-800 bg-neutral-950 text-[11px]"
      data-testid="stats-bar"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="stats-bar-details"
        className={cn(
          'flex h-6 w-full items-center gap-2 px-4 text-left text-neutral-400',
          'hover:text-neutral-200',
        )}
        title={expanded ? 'Zwiń statystyki' : 'Rozwiń statystyki'}
      >
        <span aria-hidden className="font-mono text-[10px] text-neutral-500">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="truncate">{summaryParts.join(' · ')}</span>
      </button>
      {expanded && (
        <div
          id="stats-bar-details"
          className="grid gap-4 border-t border-neutral-800 px-4 py-3 text-neutral-300 sm:grid-cols-3"
        >
          <dl className="space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Czas trwania</dt>
              <dd className="font-mono">{duration}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Zdarzenia</dt>
              <dd className="font-mono">{stats.eventCount}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Początek</dt>
              <dd className="font-mono text-[10px]">{stats.firstTimestamp ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Koniec</dt>
              <dd className="font-mono text-[10px]">{stats.lastTimestamp ?? '—'}</dd>
            </div>
          </dl>
          <dl className="space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Tokeny wejściowe</dt>
              <dd className="font-mono">{formatTokens(stats.inputTokens)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Tokeny wyjściowe</dt>
              <dd className="font-mono">{formatTokens(stats.outputTokens)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Cache (zapis)</dt>
              <dd className="font-mono">{formatTokens(stats.cacheCreationInputTokens)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Cache (odczyt)</dt>
              <dd className="font-mono">{formatTokens(stats.cacheReadInputTokens)}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-neutral-800 pt-1">
              <dt className="text-neutral-400">Razem</dt>
              <dd className="font-mono text-neutral-100">{formatTokens(stats.totalTokens)}</dd>
            </div>
          </dl>
          <div className="space-y-1">
            <div className="text-neutral-500">Narzędzia</div>
            {stats.toolCounts.length === 0 ? (
              <div className="text-neutral-600">Brak wywołań narzędzi.</div>
            ) : (
              <ul className="space-y-0.5">
                {stats.toolCounts.slice(0, 10).map((t) => (
                  <li key={t.name} className="flex justify-between gap-2 font-mono">
                    <span>{t.name}</span>
                    <span className="text-neutral-400">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
