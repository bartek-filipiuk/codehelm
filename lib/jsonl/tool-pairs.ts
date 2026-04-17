import type { JsonlEvent } from './types';

/**
 * Diff-friendly tool calls: their `input` carries enough information to
 * render a colored old→new diff in place of the raw tool_result stdout.
 */
export const DIFF_TOOL_NAMES = ['Edit', 'Write', 'NotebookEdit'] as const;
export type DiffToolName = (typeof DIFF_TOOL_NAMES)[number];

export interface DiffToolUse {
  name: DiffToolName;
  filePath: string | null;
  oldText: string;
  newText: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Extract a {old,new,file} triple from a tool_use input shape. Returns null
 * when the input doesn't carry the fields we need.
 */
export function extractDiffFromInput(name: string, input: unknown): DiffToolUse | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (name === 'Edit') {
    const oldText = str(obj['old_string']);
    const newText = str(obj['new_string']);
    if (!oldText && !newText) return null;
    return {
      name: 'Edit',
      filePath: str(obj['file_path']) || null,
      oldText,
      newText,
    };
  }
  if (name === 'Write') {
    const content = str(obj['content']);
    return {
      name: 'Write',
      filePath: str(obj['file_path']) || null,
      oldText: '',
      newText: content,
    };
  }
  if (name === 'NotebookEdit') {
    const oldText = str(obj['old_source']);
    const newText = str(obj['new_source']);
    if (!oldText && !newText) return null;
    return {
      name: 'NotebookEdit',
      filePath: str(obj['notebook_path']) || null,
      oldText,
      newText,
    };
  }
  return null;
}

/**
 * Walk all message content arrays and collect tool_use blocks whose name is
 * one of DIFF_TOOL_NAMES, keyed by the tool_use id. Later tool_result blocks
 * can look up their originating input here.
 */
export function buildToolUseRegistry(events: readonly JsonlEvent[]): Map<string, DiffToolUse> {
  const map = new Map<string, DiffToolUse>();
  for (const ev of events) {
    if (ev.type !== 'user' && ev.type !== 'assistant') continue;
    const content = (ev as { message: { content: unknown } }).message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b['type'] !== 'tool_use') continue;
      const name = typeof b['name'] === 'string' ? b['name'] : '';
      const id = typeof b['id'] === 'string' ? b['id'] : '';
      if (!id) continue;
      const diff = extractDiffFromInput(name, b['input']);
      if (diff) map.set(id, diff);
    }
  }
  return map;
}

/**
 * Generic parent tool_use lookup for the popover on tool_result blocks.
 * Unlike buildToolUseRegistry, this keeps EVERY tool_use regardless of name
 * so the UI can show which call produced a given result.
 */
export interface ParentToolUse {
  name: string;
  input: unknown;
}
export type ParentToolUseRegistry = ReadonlyMap<string, ParentToolUse>;

export function buildParentToolUseRegistry(
  events: readonly JsonlEvent[],
): Map<string, ParentToolUse> {
  const map = new Map<string, ParentToolUse>();
  for (const ev of events) {
    if (ev.type !== 'user' && ev.type !== 'assistant') continue;
    const content = (ev as { message: { content: unknown } }).message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b['type'] !== 'tool_use') continue;
      const id = typeof b['id'] === 'string' ? b['id'] : '';
      if (!id || map.has(id)) continue;
      const name = typeof b['name'] === 'string' ? b['name'] : 'unknown';
      map.set(id, { name, input: b['input'] });
    }
  }
  return map;
}
