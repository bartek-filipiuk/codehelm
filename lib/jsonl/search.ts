import type { JsonlEvent } from './types';

export interface SearchHit {
  eventIndex: number;
  field: 'user' | 'assistant' | 'tool_result' | 'tool_input';
  snippet: string;
  matchStart: number;
  matchEnd: number;
}

export function searchInEvents(
  events: readonly JsonlEvent[],
  query: string,
  { caseInsensitive = true, limit = 500 }: { caseInsensitive?: boolean; limit?: number } = {},
): SearchHit[] {
  if (!query) return [];
  const normalizedQuery = caseInsensitive ? query.toLowerCase() : query;
  const hits: SearchHit[] = [];
  for (let i = 0; i < events.length && hits.length < limit; i++) {
    const ev = events[i];
    if (!ev) continue;
    const candidates = collectSearchable(ev);
    for (const { field, text } of candidates) {
      const haystack = caseInsensitive ? text.toLowerCase() : text;
      let idx = haystack.indexOf(normalizedQuery);
      while (idx !== -1 && hits.length < limit) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + normalizedQuery.length + 40);
        hits.push({
          eventIndex: i,
          field,
          snippet: text.slice(start, end),
          matchStart: idx - start,
          matchEnd: idx - start + normalizedQuery.length,
        });
        idx = haystack.indexOf(normalizedQuery, idx + normalizedQuery.length);
      }
    }
  }
  return hits;
}

function collectSearchable(ev: JsonlEvent): { field: SearchHit['field']; text: string }[] {
  const out: { field: SearchHit['field']; text: string }[] = [];
  if (ev.type === 'user') {
    const text = extractText(ev.message.content);
    if (text) out.push({ field: 'user', text });
  } else if (ev.type === 'assistant') {
    const text = extractText(ev.message.content);
    if (text) out.push({ field: 'assistant', text });
  } else if (ev.type === 'tool_use') {
    if (ev.input !== undefined) {
      out.push({ field: 'tool_input', text: safeStringify(ev.input) });
    }
  } else if (ev.type === 'tool_result') {
    const r = ev.toolUseResult;
    if (r?.stdout) out.push({ field: 'tool_result', text: r.stdout });
    if (r?.stderr) out.push({ field: 'tool_result', text: r.stderr });
  }
  return out;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (
          c &&
          typeof c === 'object' &&
          'text' in c &&
          typeof (c as { text: unknown }).text === 'string'
        ) {
          return (c as { text: string }).text;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}
