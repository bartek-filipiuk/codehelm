'use client';

import { useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useSessionStream } from '@/hooks/use-session-stream';
import { useUiStore } from '@/stores/ui-slice';
import { searchInEvents } from '@/lib/jsonl/search';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { renderEvent } from '@/components/conversation/messages';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { cn } from '@/lib/utils';
import {
  categorizeEvent as categorize,
  EVENT_CATEGORIES as ALL_CATEGORIES,
  type EventCategory as Category,
} from '@/lib/jsonl/outline';
import { Outline } from './Outline';
import { StatsBar } from './StatsBar';

const CATEGORY_LABEL: Record<Category, string> = {
  user: 'User',
  assistant: 'Assistant',
  tools: 'Tools',
  system: 'System',
};

export function Viewer() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const { events, loading, error, done, bytes } = useSessionStream(slug, sessionId);
  const [query, setQuery] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [follow, setFollow] = useState(true);
  const [hidden, setHidden] = useState<Set<Category>>(new Set());
  const [onlyHits, setOnlyHits] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = { user: 0, assistant: 0, tools: 0, system: 0 };
    for (const ev of events) counts[categorize(ev)]++;
    return counts;
  }, [events]);

  // Hit-set used both for navigation and for "only hits" mode.
  const hits = useMemo(() => searchInEvents(events, query, { limit: 500 }), [events, query]);
  const hitEventIndexSet = useMemo(() => new Set(hits.map((h) => h.eventIndex)), [hits]);

  // Filter events (kept as pairs so navigation can still hop into filtered list).
  const visibleEvents = useMemo(() => {
    const out: { ev: JsonlEvent; origIndex: number }[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev) continue;
      if (hidden.has(categorize(ev))) continue;
      if (onlyHits && query && !hitEventIndexSet.has(i)) continue;
      out.push({ ev, origIndex: i });
    }
    return out;
  }, [events, hidden, onlyHits, query, hitEventIndexSet]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        Wybierz sesję z listy.
      </div>
    );
  }

  const toggleCategory = (c: Category) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const goToHit = (nextIdx: number) => {
    if (hits.length === 0) return;
    const idx = ((nextIdx % hits.length) + hits.length) % hits.length;
    setHitIndex(idx);
    const hit = hits[idx];
    if (!hit) return;
    // Translate original event index to position in the (possibly filtered) list.
    const visibleIdx = visibleEvents.findIndex((v) => v.origIndex === hit.eventIndex);
    if (visibleIdx >= 0) {
      virtuosoRef.current?.scrollToIndex({ index: visibleIdx, align: 'center' });
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{
        fontSize: 'var(--ui-viewer-font-size, 14px)',
        lineHeight: 'var(--ui-viewer-line-height, 1.5)',
      }}
    >
      <StatsBar events={events} />
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <div className="relative flex-1">
          <Input
            type="search"
            placeholder="Szukaj w sesji…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHitIndex(0);
            }}
            aria-label="Szukaj w sesji"
          />
          {query && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">
              {hits.length === 0 ? '0' : `${hitIndex + 1}/${hits.length}`}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => goToHit(hitIndex - 1)}
          disabled={hits.length === 0}
          title="Poprzednie trafienie"
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => goToHit(hitIndex + 1)}
          disabled={hits.length === 0}
          title="Następne trafienie"
        >
          ↓
        </Button>
        <Button
          size="sm"
          variant={onlyHits ? 'secondary' : 'ghost'}
          onClick={() => setOnlyHits((v) => !v)}
          disabled={!query}
          title="Pokazuj tylko wiadomości z trafieniem"
        >
          tylko ▾
        </Button>
        <Button
          size="sm"
          variant={follow ? 'secondary' : 'outline'}
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          title="Automatyczne przewijanie do najnowszej wiadomości"
        >
          {follow ? 'Follow: on' : 'Follow: off'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-2 text-[11px]">
        {ALL_CATEGORIES.map((c) => {
          const active = !hidden.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCategory(c)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors',
                active
                  ? 'border-neutral-600 bg-neutral-800 text-neutral-100'
                  : 'border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300',
              )}
              aria-pressed={active}
            >
              <span>{CATEGORY_LABEL[c]}</span>
              <span
                className={cn(
                  'rounded-full px-1 font-mono text-[10px]',
                  active ? 'bg-neutral-700 text-neutral-200' : 'bg-neutral-800 text-neutral-500',
                )}
              >
                {categoryCounts[c]}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-neutral-500">
          {visibleEvents.length}/{events.length} · {(bytes / 1024).toFixed(1)} KB{' '}
          {loading && !done && '…'}
        </span>
      </div>

      {error && (
        <div className="border-b border-red-900 bg-red-900/20 px-4 py-2 text-sm text-red-300">
          Błąd: {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {events.length === 0 && loading ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
              Żadne zdarzenie nie pasuje do filtrów.
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              className={cn('h-full')}
              data={visibleEvents}
              followOutput={follow ? 'smooth' : false}
              atBottomThreshold={120}
              rangeChanged={({ startIndex, endIndex }) =>
                setVisibleRange({ start: startIndex, end: endIndex })
              }
              itemContent={(index, pair) => (
                <div className="px-4 py-1.5">{renderEvent(pair.ev, pair.origIndex)}</div>
              )}
            />
          )}
        </div>
        {visibleEvents.length > 0 && (
          <Outline
            events={visibleEvents}
            visibleStart={visibleRange.start}
            visibleEnd={visibleRange.end}
            onJump={(idx) =>
              virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' })
            }
          />
        )}
      </div>
    </div>
  );
}
