import type { JsonlEvent } from '@/lib/jsonl/types';
import { categorizeEvent, eventPreview, type EventCategory } from '@/lib/jsonl/outline';

export type GraphNodeKind = 'user' | 'assistant' | 'tool';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  eventIndex: number;
  label: string;
  toolName?: string;
  category: EventCategory;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  dashed?: boolean;
}

export interface ConversationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function toolUseBlocks(
  content: unknown,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ id: string; name: string }> = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b['type'] !== 'tool_use') continue;
    const id = typeof b['id'] === 'string' ? b['id'] : '';
    const name = typeof b['name'] === 'string' ? b['name'] : 'tool';
    if (!id) continue;
    out.push({ id, name });
  }
  return out;
}

/**
 * Build a DAG from a session's events.
 *
 * Main axis: user messages chained in time order. Assistant messages branch off
 * the user that preceded them. Tool calls (tool_use content blocks inside an
 * assistant message) hang as leaves under that assistant node.
 */
export function buildConversationGraph(events: readonly JsonlEvent[]): ConversationGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  let prevUserId: string | null = null;
  let lastUserId: string | null = null;
  let lastAssistantId: string | null = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev) continue;
    const cat = categorizeEvent(ev);

    if (ev.type === 'user') {
      const id = `u-${i}`;
      nodes.push({
        id,
        kind: 'user',
        eventIndex: i,
        label: eventPreview(ev, 60) || 'user',
        category: cat,
      });
      if (prevUserId) edges.push({ id: `e-${prevUserId}-${id}`, source: prevUserId, target: id });
      prevUserId = id;
      lastUserId = id;
      lastAssistantId = null;
      continue;
    }

    if (ev.type === 'assistant') {
      const id = `a-${i}`;
      nodes.push({
        id,
        kind: 'assistant',
        eventIndex: i,
        label: eventPreview(ev, 60) || 'assistant',
        category: cat,
      });
      if (lastUserId) edges.push({ id: `e-${lastUserId}-${id}`, source: lastUserId, target: id });
      lastAssistantId = id;

      const tools = toolUseBlocks(ev.message.content);
      for (const t of tools) {
        const tid = `t-${i}-${t.id}`;
        nodes.push({
          id: tid,
          kind: 'tool',
          eventIndex: i,
          label: t.name,
          toolName: t.name,
          category: 'tools',
        });
        edges.push({ id: `e-${id}-${tid}`, source: id, target: tid });
      }
      continue;
    }

    if (ev.type === 'tool_use') {
      const id = `ts-${i}`;
      const toolName = typeof ev.name === 'string' ? ev.name : 'tool';
      nodes.push({
        id,
        kind: 'tool',
        eventIndex: i,
        label: toolName,
        toolName,
        category: 'tools',
      });
      const parent = lastAssistantId ?? lastUserId;
      if (parent) edges.push({ id: `e-${parent}-${id}`, source: parent, target: id, dashed: true });
      continue;
    }
    // tool_result / system / attachment / others intentionally omitted from the
    // graph — they are visible in the Viewer and would clutter the DAG.
  }

  return { nodes, edges };
}
