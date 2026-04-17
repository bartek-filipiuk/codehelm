import { describe, expect, it } from 'vitest';
import { parseJumpQuery } from '@/lib/jsonl/jump';
import type { JsonlEvent } from '@/lib/jsonl/types';

function ev(ts: string): JsonlEvent {
  return {
    type: 'user',
    timestamp: ts,
    message: { role: 'user', content: 'x' },
  } as JsonlEvent;
}

const events: JsonlEvent[] = [
  ev('2026-04-16T12:00:00.000Z'),
  ev('2026-04-16T12:00:30.000Z'),
  ev('2026-04-16T12:05:00.000Z'),
  ev('2026-04-16T13:30:00.000Z'),
  ev('2026-04-16T14:00:00.000Z'),
];

describe('parseJumpQuery', () => {
  it('returns null for empty input or empty events', () => {
    expect(parseJumpQuery('', events)).toBeNull();
    expect(parseJumpQuery('5m', [])).toBeNull();
  });

  it('treats a bare integer as 1-based event index', () => {
    expect(parseJumpQuery('1', events)).toBe(0);
    expect(parseJumpQuery('3', events)).toBe(2);
  });

  it('clamps index to the last event when over-range', () => {
    expect(parseJumpQuery('999', events)).toBe(events.length - 1);
  });

  it('clamps 0 or negative-ish input to first event', () => {
    expect(parseJumpQuery('0', events)).toBe(0);
  });

  it('resolves minute offsets relative to the first timestamp', () => {
    expect(parseJumpQuery('5m', events)).toBe(2);
    expect(parseJumpQuery('90m', events)).toBe(3);
  });

  it('resolves compound hour+minute offsets', () => {
    expect(parseJumpQuery('1h30m', events)).toBe(3);
    expect(parseJumpQuery('2h', events)).toBe(4);
  });

  it('accepts second-only offsets', () => {
    expect(parseJumpQuery('30s', events)).toBe(1);
    expect(parseJumpQuery('29s', events)).toBe(1);
  });

  it('returns null for garbage input', () => {
    expect(parseJumpQuery('abc', events)).toBeNull();
    expect(parseJumpQuery('--', events)).toBeNull();
  });

  it('falls back to last event if offset exceeds last timestamp', () => {
    expect(parseJumpQuery('10h', events)).toBe(events.length - 1);
  });
});
