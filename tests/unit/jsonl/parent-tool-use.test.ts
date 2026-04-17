import { describe, expect, it } from 'vitest';
import { buildParentToolUseRegistry } from '@/lib/jsonl/tool-pairs';
import type { JsonlEvent } from '@/lib/jsonl/types';

function assistantWithTool(id: string, name: string, input: unknown): JsonlEvent {
  return {
    type: 'assistant',
    timestamp: '2026-04-17T12:00:00.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id, name, input }],
    },
  } as JsonlEvent;
}

describe('buildParentToolUseRegistry', () => {
  it('captures every tool_use regardless of name', () => {
    const events: JsonlEvent[] = [
      assistantWithTool('a1', 'Bash', { command: 'ls' }),
      assistantWithTool('a2', 'WebFetch', { url: 'https://example.com' }),
      assistantWithTool('a3', 'Edit', { file_path: '/tmp/x', old_string: 'a', new_string: 'b' }),
    ];
    const reg = buildParentToolUseRegistry(events);
    expect(reg.size).toBe(3);
    expect(reg.get('a1')?.name).toBe('Bash');
    expect(reg.get('a2')?.name).toBe('WebFetch');
    expect(reg.get('a3')?.name).toBe('Edit');
  });

  it('preserves the original input object by reference', () => {
    const input = { command: 'pnpm test' };
    const events: JsonlEvent[] = [assistantWithTool('a1', 'Bash', input)];
    const reg = buildParentToolUseRegistry(events);
    expect(reg.get('a1')?.input).toBe(input);
  });

  it('falls back to name "unknown" when the block has no name field', () => {
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        timestamp: '2026-04-17T12:00:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'a1', input: {} }],
        },
      } as JsonlEvent,
    ];
    const reg = buildParentToolUseRegistry(events);
    expect(reg.get('a1')?.name).toBe('unknown');
  });

  it('ignores tool_use blocks without an id', () => {
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        timestamp: '2026-04-17T12:00:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Bash', input: {} }],
        },
      } as JsonlEvent,
    ];
    expect(buildParentToolUseRegistry(events).size).toBe(0);
  });

  it('does not overwrite the first seen entry on duplicate ids', () => {
    const events: JsonlEvent[] = [
      assistantWithTool('dup', 'Bash', { command: 'first' }),
      assistantWithTool('dup', 'Bash', { command: 'second' }),
    ];
    const reg = buildParentToolUseRegistry(events);
    const input = reg.get('dup')?.input as { command: string };
    expect(input.command).toBe('first');
  });

  it('returns an empty map when no tool_use blocks exist', () => {
    const events: JsonlEvent[] = [
      {
        type: 'user',
        timestamp: '2026-04-17T12:00:00.000Z',
        message: { role: 'user', content: 'hi' },
      } as JsonlEvent,
    ];
    expect(buildParentToolUseRegistry(events).size).toBe(0);
  });
});
