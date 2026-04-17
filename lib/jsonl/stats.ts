import type { JsonlEvent } from './types';

export interface ToolCount {
  name: string;
  count: number;
}

export interface SessionStats {
  eventCount: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  toolCounts: ToolCount[];
}

function parseTs(ts: string | undefined): number | null {
  if (!ts) return null;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : null;
}

function collectToolUses(ev: JsonlEvent, counts: Map<string, number>): void {
  if (ev.type === 'tool_use') {
    const name = ev.name ?? 'unknown';
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return;
  }
  if (ev.type === 'assistant') {
    const content = ev.message.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as { type?: unknown; name?: unknown };
      if (b.type !== 'tool_use') continue;
      const name = typeof b.name === 'string' && b.name ? b.name : 'unknown';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
}

export function computeSessionStats(events: readonly JsonlEvent[]): SessionStats {
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;
  const toolCounts = new Map<string, number>();

  for (const ev of events) {
    const tsStr = ev.timestamp;
    const ts = parseTs(tsStr);
    if (ts !== null) {
      if (firstMs === null || ts < firstMs) {
        firstMs = ts;
        firstTs = tsStr ?? null;
      }
      if (lastMs === null || ts > lastMs) {
        lastMs = ts;
        lastTs = tsStr ?? null;
      }
    }
    if (ev.type === 'assistant') {
      const usage = ev.message.usage;
      if (usage) {
        if (typeof usage.input_tokens === 'number') inputTokens += usage.input_tokens;
        if (typeof usage.output_tokens === 'number') outputTokens += usage.output_tokens;
        if (typeof usage.cache_creation_input_tokens === 'number') {
          cacheCreationInputTokens += usage.cache_creation_input_tokens;
        }
        if (typeof usage.cache_read_input_tokens === 'number') {
          cacheReadInputTokens += usage.cache_read_input_tokens;
        }
      }
    }
    collectToolUses(ev, toolCounts);
  }

  const sortedTools: ToolCount[] = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  const durationMs = firstMs !== null && lastMs !== null ? lastMs - firstMs : null;

  return {
    eventCount: events.length,
    firstTimestamp: firstTs,
    lastTimestamp: lastTs,
    durationMs,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens:
      inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens,
    toolCounts: sortedTools,
  };
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

export function formatTokens(n: number): string {
  if (n <= 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}
