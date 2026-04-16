import { describe, it, expect } from 'vitest';
import { sessionToMarkdown } from '@/lib/jsonl/export-md';
import type { JsonlEvent } from '@/lib/jsonl/types';

const sample: JsonlEvent[] = [
  { type: 'user', message: { role: 'user', content: 'Hello, Claude' } } as JsonlEvent,
  {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] as unknown[] },
  } as JsonlEvent,
  { type: 'tool_use', name: 'Bash', input: { command: 'ls' } } as JsonlEvent,
  {
    type: 'tool_result',
    toolUseResult: { stdout: 'file1\nfile2\n', stderr: '', exitCode: 0 },
  } as JsonlEvent,
  { type: 'system', slug: 'hook-fired' } as JsonlEvent,
];

describe('sessionToMarkdown', () => {
  it('zawiera heading z sessionId', () => {
    const md = sessionToMarkdown(sample, { sessionId: 'abc-123' });
    expect(md).toContain('# Claude Code session — abc-123');
  });

  it('renderuje wszystkie typy (user/assistant/tool_use/tool_result/system)', () => {
    const md = sessionToMarkdown(sample, { sessionId: 'x' });
    expect(md).toContain('## User');
    expect(md).toContain('Hello, Claude');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Hi there!');
    expect(md).toContain('### Tool use');
    expect(md).toContain('"command": "ls"');
    expect(md).toContain('### Tool result');
    expect(md).toContain('file1');
    expect(md).toContain('system');
  });

  it('pomija noisy meta (queue-operation)', () => {
    const events: JsonlEvent[] = [
      { type: 'queue-operation', operation: 'enqueue' } as JsonlEvent,
      { type: 'user', message: { role: 'user', content: 'real' } } as JsonlEvent,
    ];
    const md = sessionToMarkdown(events, { sessionId: 'x' });
    expect(md).toContain('real');
    expect(md).not.toContain('queue-operation');
  });

  it('obsługuje pustą sesję', () => {
    const md = sessionToMarkdown([], { sessionId: 'empty' });
    expect(md).toContain('# Claude Code session — empty');
  });
});
