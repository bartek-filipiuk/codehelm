import { describe, it, expect } from 'vitest';
import { buildConversationGraph } from '@/lib/conversation/graph-build';
import type { JsonlEvent } from '@/lib/jsonl/types';

function user(text: string): JsonlEvent {
  return {
    type: 'user',
    message: { role: 'user', content: text },
  } as unknown as JsonlEvent;
}

function assistant(
  content: Array<{ type: string; [k: string]: unknown }>,
): JsonlEvent {
  return {
    type: 'assistant',
    message: { role: 'assistant', content },
  } as unknown as JsonlEvent;
}

describe('buildConversationGraph', () => {
  it('chains user messages along the main axis', () => {
    const events: JsonlEvent[] = [user('hi'), user('second'), user('third')];
    const g = buildConversationGraph(events);
    expect(g.nodes.map((n) => n.kind)).toEqual(['user', 'user', 'user']);
    expect(g.edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      'u-0->u-1',
      'u-1->u-2',
    ]);
  });

  it('branches assistant nodes off the preceding user', () => {
    const events: JsonlEvent[] = [
      user('question'),
      assistant([{ type: 'text', text: 'answer' }]),
    ];
    const g = buildConversationGraph(events);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes[1]?.kind).toBe('assistant');
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ source: 'u-0', target: 'a-1' });
  });

  it('attaches tool_use blocks as leaves under their assistant parent', () => {
    const events: JsonlEvent[] = [
      user('do a thing'),
      assistant([
        { type: 'text', text: 'sure' },
        { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool_use', id: 'tool-2', name: 'Read', input: { file_path: '/x' } },
      ]),
    ];
    const g = buildConversationGraph(events);
    const toolNodes = g.nodes.filter((n) => n.kind === 'tool');
    expect(toolNodes).toHaveLength(2);
    expect(toolNodes.map((n) => n.toolName)).toEqual(['Bash', 'Read']);
    // Every tool edge starts from the assistant node.
    const toolEdges = g.edges.filter((e) => e.target.startsWith('t-'));
    expect(toolEdges.every((e) => e.source === 'a-1')).toBe(true);
  });

  it('skips tool_use blocks without an id', () => {
    const events: JsonlEvent[] = [
      user('q'),
      assistant([{ type: 'tool_use', name: 'Bash', input: {} }]),
    ];
    const g = buildConversationGraph(events);
    expect(g.nodes.filter((n) => n.kind === 'tool')).toHaveLength(0);
  });

  it('handles standalone tool_use events by attaching to the last assistant', () => {
    const events: JsonlEvent[] = [
      user('q'),
      assistant([{ type: 'text', text: 'working' }]),
      { type: 'tool_use', name: 'Grep', id: 'foo' } as unknown as JsonlEvent,
    ];
    const g = buildConversationGraph(events);
    const tool = g.nodes.find((n) => n.kind === 'tool');
    expect(tool).toBeDefined();
    const toolEdge = g.edges.find((e) => e.target === tool!.id);
    expect(toolEdge?.source).toBe('a-1');
    expect(toolEdge?.dashed).toBe(true);
  });

  it('omits tool_result / system / attachment events from the graph', () => {
    const events: JsonlEvent[] = [
      user('q'),
      assistant([{ type: 'text', text: 'done' }]),
      { type: 'tool_result', toolUseResult: { stdout: 'ok' } } as unknown as JsonlEvent,
      { type: 'system', slug: 'hook' } as unknown as JsonlEvent,
    ];
    const g = buildConversationGraph(events);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes.map((n) => n.kind)).toEqual(['user', 'assistant']);
  });

  it('scales to 200 events in well under a second', () => {
    const events: JsonlEvent[] = [];
    for (let i = 0; i < 50; i++) {
      events.push(user(`msg ${i}`));
      events.push(
        assistant([
          { type: 'text', text: `reply ${i}` },
          { type: 'tool_use', id: `t-${i}-a`, name: 'Bash', input: { command: 'echo' } },
          { type: 'tool_use', id: `t-${i}-b`, name: 'Read', input: {} },
        ]),
      );
    }
    expect(events.length).toBeGreaterThanOrEqual(100);
    const start = performance.now();
    const g = buildConversationGraph(events);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(g.nodes.length).toBeGreaterThan(100);
  });
});
