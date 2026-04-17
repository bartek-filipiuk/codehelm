import { describe, expect, it } from 'vitest';
import { computeSessionStats, formatDuration, formatTokens } from '@/lib/jsonl/stats';
import type { JsonlEvent } from '@/lib/jsonl/types';

function ev<T extends JsonlEvent['type']>(e: Extract<JsonlEvent, { type: T }>): JsonlEvent {
  return e;
}

describe('computeSessionStats', () => {
  it('returns zeroed stats for empty input', () => {
    const stats = computeSessionStats([]);
    expect(stats.eventCount).toBe(0);
    expect(stats.durationMs).toBeNull();
    expect(stats.firstTimestamp).toBeNull();
    expect(stats.lastTimestamp).toBeNull();
    expect(stats.totalTokens).toBe(0);
    expect(stats.toolCounts).toEqual([]);
  });

  it('computes duration from earliest to latest timestamp regardless of order', () => {
    const events: JsonlEvent[] = [
      ev({
        type: 'user',
        timestamp: '2026-04-15T10:05:00.000Z',
        message: { role: 'user', content: 'second' },
      }),
      ev({
        type: 'user',
        timestamp: '2026-04-15T10:00:00.000Z',
        message: { role: 'user', content: 'first' },
      }),
      ev({
        type: 'assistant',
        timestamp: '2026-04-15T10:02:30.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'mid' }] as never },
      }),
    ];
    const stats = computeSessionStats(events);
    expect(stats.firstTimestamp).toBe('2026-04-15T10:00:00.000Z');
    expect(stats.lastTimestamp).toBe('2026-04-15T10:05:00.000Z');
    expect(stats.durationMs).toBe(5 * 60 * 1000);
  });

  it('skips events without parsable timestamps', () => {
    const events: JsonlEvent[] = [
      ev({ type: 'system' }),
      ev({
        type: 'user',
        timestamp: 'not-a-date',
        message: { role: 'user', content: 'hi' },
      }),
    ];
    const stats = computeSessionStats(events);
    expect(stats.durationMs).toBeNull();
    expect(stats.firstTimestamp).toBeNull();
  });

  it('sums token usage across assistant events and falls back to zero', () => {
    const events: JsonlEvent[] = [
      ev({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'a' }] as never,
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 5,
          },
        },
      }),
      ev({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'b' }] as never,
          usage: {
            input_tokens: 10,
            output_tokens: 3,
            cache_creation_input_tokens: 7,
          },
        },
      }),
      ev({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'c' }] as never,
        },
      }),
    ];
    const stats = computeSessionStats(events);
    expect(stats.inputTokens).toBe(110);
    expect(stats.outputTokens).toBe(23);
    expect(stats.cacheCreationInputTokens).toBe(7);
    expect(stats.cacheReadInputTokens).toBe(5);
    expect(stats.totalTokens).toBe(145);
  });

  it('counts tool_use events from both top-level and assistant content blocks', () => {
    const events: JsonlEvent[] = [
      ev({ type: 'tool_use', name: 'Bash' }),
      ev({ type: 'tool_use', name: 'Bash' }),
      ev({ type: 'tool_use', name: 'Read' }),
      ev({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Bash', input: {} },
            { type: 'tool_use', name: 'Edit', input: {} },
          ] as never,
        },
      }),
    ];
    const stats = computeSessionStats(events);
    const counts = Object.fromEntries(stats.toolCounts.map((t) => [t.name, t.count]));
    expect(counts).toEqual({ Bash: 3, Read: 1, Edit: 1 });
  });

  it('sorts tool counts descending, breaking ties alphabetically', () => {
    const events: JsonlEvent[] = [
      ev({ type: 'tool_use', name: 'Zed' }),
      ev({ type: 'tool_use', name: 'Ack' }),
      ev({ type: 'tool_use', name: 'Ack' }),
      ev({ type: 'tool_use', name: 'Bob' }),
      ev({ type: 'tool_use', name: 'Bob' }),
    ];
    const stats = computeSessionStats(events);
    expect(stats.toolCounts.map((t) => t.name)).toEqual(['Ack', 'Bob', 'Zed']);
  });

  it('labels tool_use without a name as "unknown"', () => {
    const events: JsonlEvent[] = [ev({ type: 'tool_use' })];
    const stats = computeSessionStats(events);
    expect(stats.toolCounts).toEqual([{ name: 'unknown', count: 1 }]);
  });

  it('reports total event count', () => {
    const events: JsonlEvent[] = [
      ev({ type: 'user', message: { role: 'user', content: 'a' } }),
      ev({ type: 'system' }),
      ev({ type: 'tool_use', name: 'X' }),
    ];
    expect(computeSessionStats(events).eventCount).toBe(3);
  });
});

describe('formatDuration', () => {
  it('returns em dash for null', () => {
    expect(formatDuration(null)).toBe('—');
  });
  it('returns em dash for negative', () => {
    expect(formatDuration(-1)).toBe('—');
  });
  it('formats seconds only', () => {
    expect(formatDuration(42_000)).toBe('42s');
  });
  it('formats minutes and seconds', () => {
    expect(formatDuration(125_000)).toBe('2min 5s');
  });
  it('formats hours and minutes', () => {
    expect(formatDuration(2 * 3600 * 1000 + 14 * 60 * 1000)).toBe('2h 14min');
  });
});

describe('formatTokens', () => {
  it('handles zero', () => {
    expect(formatTokens(0)).toBe('0');
  });
  it('keeps small counts intact', () => {
    expect(formatTokens(999)).toBe('999');
  });
  it('uses k suffix below 10k with one decimal', () => {
    expect(formatTokens(1500)).toBe('1.5k');
  });
  it('uses k suffix without decimals above 10k', () => {
    expect(formatTokens(42_000)).toBe('42k');
  });
  it('uses M suffix for millions', () => {
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});
