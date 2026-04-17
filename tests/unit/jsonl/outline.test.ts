import { describe, expect, it } from 'vitest';
import {
  CATEGORY_MARKER_CLASS,
  categorizeEvent,
  eventBytes,
  eventPreview,
  markerHeightPx,
} from '@/lib/jsonl/outline';
import type { JsonlEvent } from '@/lib/jsonl/types';

function ev<T extends JsonlEvent['type']>(e: Extract<JsonlEvent, { type: T }>): JsonlEvent {
  return e;
}

describe('categorizeEvent', () => {
  it('plain user message → user', () => {
    expect(categorizeEvent(ev({ type: 'user', message: { role: 'user', content: 'hi' } }))).toBe(
      'user',
    );
  });
  it('user with embedded tool_result → tools', () => {
    expect(
      categorizeEvent(
        ev({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', content: 'x', tool_use_id: 't1' }],
          },
        }),
      ),
    ).toBe('tools');
  });
  it('assistant text only → assistant', () => {
    expect(
      categorizeEvent(
        ev({
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] as never },
        }),
      ),
    ).toBe('assistant');
  });
  it('assistant with tool_use → tools', () => {
    expect(
      categorizeEvent(
        ev({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', name: 'Bash', input: {} }] as never,
          },
        }),
      ),
    ).toBe('tools');
  });
  it('top-level tool_use / tool_result → tools', () => {
    expect(categorizeEvent(ev({ type: 'tool_use', name: 'X' }))).toBe('tools');
    expect(categorizeEvent(ev({ type: 'tool_result' }))).toBe('tools');
  });
  it('system & attachment → system', () => {
    expect(categorizeEvent(ev({ type: 'system' }))).toBe('system');
    expect(categorizeEvent(ev({ type: 'attachment' }))).toBe('system');
  });
});

describe('eventBytes', () => {
  it('counts user string content', () => {
    const e = ev({ type: 'user', message: { role: 'user', content: 'hello' } });
    expect(eventBytes(e)).toBe(5);
  });
  it('counts assistant block text', () => {
    const e = ev({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'abc' },
          { type: 'text', text: 'def' },
        ] as never,
      },
    });
    expect(eventBytes(e)).toBeGreaterThanOrEqual(6);
  });
  it('counts tool_result stdout + stderr', () => {
    const e = ev({
      type: 'tool_result',
      toolUseResult: { stdout: 'aaaa', stderr: 'bb' },
    });
    expect(eventBytes(e)).toBe(6);
  });
  it('returns 0 for unknown-shaped events', () => {
    expect(eventBytes(ev({ type: 'file-history-snapshot' }))).toBe(0);
  });
});

describe('eventPreview', () => {
  it('truncates to 60 chars by default and collapses whitespace', () => {
    const long = 'a'.repeat(120);
    const e = ev({ type: 'user', message: { role: 'user', content: `   ${long}   ` } });
    const p = eventPreview(e);
    expect(p.length).toBe(60);
    expect(p.startsWith('aaaa')).toBe(true);
  });
  it('collapses internal newlines and tabs', () => {
    const e = ev({
      type: 'user',
      message: { role: 'user', content: 'line one\n\tline two' },
    });
    expect(eventPreview(e)).toBe('line one line two');
  });
  it('falls back to tool name for tool_use', () => {
    const e = ev({ type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } });
    expect(eventPreview(e)).toContain('Bash');
  });
  it('renders system slug', () => {
    const e = ev({ type: 'system', slug: 'session-start' });
    expect(eventPreview(e)).toBe('session-start');
  });
});

describe('markerHeightPx', () => {
  it('floors at min for empty content', () => {
    expect(markerHeightPx(0)).toBe(2);
  });
  it('grows with bytes (monotonic-ish via log)', () => {
    const small = markerHeightPx(100);
    const big = markerHeightPx(100_000);
    expect(big).toBeGreaterThan(small);
  });
  it('caps at max', () => {
    expect(markerHeightPx(10_000_000_000, { max: 24 })).toBe(24);
  });
  it('respects custom min/max', () => {
    expect(markerHeightPx(0, { min: 5 })).toBe(5);
  });
});

describe('CATEGORY_MARKER_CLASS', () => {
  it('has a tailwind class for every category', () => {
    expect(CATEGORY_MARKER_CLASS.user).toMatch(/^bg-/);
    expect(CATEGORY_MARKER_CLASS.assistant).toMatch(/^bg-/);
    expect(CATEGORY_MARKER_CLASS.tools).toMatch(/^bg-/);
    expect(CATEGORY_MARKER_CLASS.system).toMatch(/^bg-/);
  });
});
