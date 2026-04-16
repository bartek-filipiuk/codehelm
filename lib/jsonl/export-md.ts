import type { JsonlEvent } from './types';

export function sessionToMarkdown(
  events: Iterable<JsonlEvent>,
  meta: { sessionId: string; projectSlug?: string } = { sessionId: 'unknown' },
): string {
  const lines: string[] = [];
  lines.push(`# Claude Code session — ${meta.sessionId}`);
  if (meta.projectSlug) lines.push(`Project: \`${meta.projectSlug}\``);
  lines.push('');

  for (const ev of events) {
    switch (ev.type) {
      case 'user':
        lines.push('## User');
        lines.push(extractText(ev.message.content));
        lines.push('');
        break;
      case 'assistant':
        lines.push('## Assistant');
        lines.push(extractText(ev.message.content));
        lines.push('');
        break;
      case 'tool_use':
        lines.push(`### Tool use — \`${ev.name ?? 'unknown'}\``);
        lines.push('```json');
        lines.push(JSON.stringify(ev.input ?? null, null, 2));
        lines.push('```');
        lines.push('');
        break;
      case 'tool_result': {
        lines.push('### Tool result');
        const r = ev.toolUseResult;
        if (r?.stdout) {
          lines.push('**stdout:**');
          lines.push('```');
          lines.push(r.stdout);
          lines.push('```');
        }
        if (r?.stderr) {
          lines.push('**stderr:**');
          lines.push('```');
          lines.push(r.stderr);
          lines.push('```');
        }
        if (typeof r?.exitCode === 'number') lines.push(`_exit: ${r.exitCode}_`);
        lines.push('');
        break;
      }
      case 'system':
        lines.push(`> _system: ${ev.slug ?? ev.subtype ?? 'event'}_`);
        lines.push('');
        break;
      case 'attachment':
        lines.push(
          `> _attachment: ${ev.hookName ?? ev.command ?? 'hook'} (exit ${ev.exitCode ?? '?'})_`,
        );
        lines.push('');
        break;
      case 'queue-operation':
      case 'permission-mode':
      case 'file-history-snapshot':
        // Skip noisy meta events from export.
        break;
    }
  }
  return lines.join('\n');
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
        if (c && typeof c === 'object' && 'type' in c) return `_[${(c as { type: string }).type}]_`;
        return '';
      })
      .join('\n');
  }
  return '';
}
