'use client';

import { useState } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import type { DiffToolUse, ParentToolUseRegistry } from '@/lib/jsonl/tool-pairs';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';
import { DiffView } from './DiffView';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSettings } from '@/hooks/use-settings';
import { formatTimestamp } from '@/lib/jsonl/format-timestamp';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';

export type ToolUseRegistry = ReadonlyMap<string, DiffToolUse>;

const POPOVER_INPUT_MAX_BYTES = 10_000;

const MAX_RENDER_BYTES = 10_000_000;

/**
 * Normalised content block. Claude Code stores `message.content` as either a
 * plain string (legacy user messages) or an array of typed blocks. We expose
 * each block so the renderer can show text, tool calls, and tool results
 * inline in the order they were produced.
 */
type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; name: string; input: unknown; id: string | null }
  | { kind: 'tool_result'; text: string; toolUseId: string | null; isError: boolean };

function toolResultToText(raw: unknown): { text: string; isError: boolean } {
  // Anthropic SDK shape: { type: 'tool_result', content: string | Array<{type,text}>, is_error? }
  let text = '';
  if (typeof raw === 'string') text = raw;
  else if (Array.isArray(raw)) {
    text = raw
      .map((c) => {
        if (c && typeof c === 'object' && 'text' in c) {
          return String((c as { text: unknown }).text ?? '');
        }
        return '';
      })
      .join('\n');
  } else if (raw && typeof raw === 'object') {
    try {
      text = JSON.stringify(raw, null, 2);
    } catch {
      text = '[unserialisable]';
    }
  }
  return { text, isError: false };
}

function splitBlocks(content: unknown): ContentBlock[] {
  if (typeof content === 'string') return [{ kind: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  const out: ContentBlock[] = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    const item = c as Record<string, unknown>;
    const t = item['type'];
    if (t === 'text' && typeof item['text'] === 'string') {
      out.push({ kind: 'text', text: item['text'] as string });
    } else if (t === 'thinking' && typeof item['thinking'] === 'string') {
      out.push({ kind: 'thinking', text: item['thinking'] as string });
    } else if (t === 'tool_use') {
      out.push({
        kind: 'tool_use',
        name: typeof item['name'] === 'string' ? (item['name'] as string) : 'unknown',
        input: item['input'],
        id: typeof item['id'] === 'string' ? (item['id'] as string) : null,
      });
    } else if (t === 'tool_result') {
      const { text } = toolResultToText(item['content']);
      out.push({
        kind: 'tool_result',
        text,
        toolUseId: typeof item['tool_use_id'] === 'string' ? (item['tool_use_id'] as string) : null,
        isError: item['is_error'] === true,
      });
    }
  }
  return out;
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_RENDER_BYTES) return { text, truncated: false };
  return { text: text.slice(0, MAX_RENDER_BYTES), truncated: true };
}

function Wrapper({
  role,
  color,
  children,
  timestamp,
}: {
  role: string;
  color: string;
  children: React.ReactNode;
  timestamp?: string | undefined;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-2 flex w-16 shrink-0 items-start justify-end">
        <span className={`text-[10px] uppercase tracking-wider ${color}`}>{role}</span>
      </div>
      <div className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900/60 p-3">
        {children}
        {timestamp && <TimestampBadge iso={timestamp} />}
      </div>
    </div>
  );
}

function TimestampBadge({ iso }: { iso: string }) {
  const { data: settings } = useSettings();
  const mode = settings?.timestampFormat ?? DEFAULT_SETTINGS.timestampFormat;
  const text = formatTimestamp(iso, mode);
  if (!text) return null;
  return (
    <time dateTime={iso} className="mt-2 block font-mono text-[10px] text-neutral-500" title={iso}>
      {text}
    </time>
  );
}

function Blocks({
  blocks,
  markdown,
  registry,
  parentRegistry,
}: {
  blocks: ContentBlock[];
  markdown: boolean;
  registry?: ToolUseRegistry | undefined;
  parentRegistry?: ParentToolUseRegistry | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.kind === 'text') {
          const { text, truncated } = truncate(b.text);
          return (
            <div key={i}>
              {markdown ? (
                <Markdown text={text} />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-sm text-neutral-100">
                  {text}
                </pre>
              )}
              {truncated && <TruncatedHint />}
            </div>
          );
        }
        if (b.kind === 'thinking') {
          const { text, truncated } = truncate(b.text);
          return (
            <details
              key={i}
              className="rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400"
            >
              <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-neutral-500">
                thinking
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-neutral-400">
                {text}
              </pre>
              {truncated && <TruncatedHint />}
            </details>
          );
        }
        if (b.kind === 'tool_use') {
          return <ToolUseBlock key={i} name={b.name} input={b.input} />;
        }
        const diff = b.toolUseId ? registry?.get(b.toolUseId) : undefined;
        const parent = b.toolUseId ? parentRegistry?.get(b.toolUseId) : undefined;
        return (
          <ToolResultBlock
            key={i}
            text={b.text}
            isError={b.isError}
            diff={diff ?? null}
            parent={parent ?? null}
          />
        );
      })}
    </div>
  );
}

function ToolUseBlock({ name, input }: { name: string; input: unknown }) {
  const [open, setOpen] = useState(false);
  const inputStr = input !== undefined ? JSON.stringify(input, null, 2) : '{}';
  const oneLine = inputStr.replace(/\s+/g, ' ').slice(0, 180);
  return (
    <div className="rounded-md border border-amber-900/60 bg-amber-950/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        <span className="text-neutral-400">{open ? '▼' : '▶'}</span>
        <span className="font-mono font-semibold text-amber-300">{name}</span>
        {!open && <span className="truncate font-mono text-neutral-500">{oneLine}</span>}
      </button>
      {open && (
        <div className="border-t border-amber-900/60 px-3 pb-3 pt-2">
          <CodeBlock code={inputStr} lang="json" />
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({
  text,
  isError,
  diff,
  parent,
}: {
  text: string;
  isError: boolean;
  diff: DiffToolUse | null;
  parent: { name: string; input: unknown } | null;
}) {
  const [open, setOpen] = useState(diff !== null && !isError);
  const { text: safe, truncated } = truncate(text);
  const oneLine = safe.replace(/\s+/g, ' ').slice(0, 180);
  const tone = isError ? 'border-red-900/60 bg-red-950/20' : 'border-sky-900/60 bg-sky-950/10';
  const showDiff = diff !== null && !isError;
  const summary = showDiff ? `${diff.name}${diff.filePath ? ` · ${diff.filePath}` : ''}` : oneLine;
  const headerLabel = showDiff
    ? isError
      ? 'tool_result · diff · error'
      : 'tool_result · diff'
    : isError
      ? 'tool_result · error'
      : 'tool_result';
  return (
    <div className={`rounded-md border ${tone}`}>
      <div className="flex w-full items-center gap-2 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className="text-neutral-400">{open ? '▼' : '▶'}</span>
          <span
            className={`font-mono text-[10px] uppercase tracking-wider ${
              isError ? 'text-red-300' : 'text-sky-300'
            }`}
          >
            {headerLabel}
          </span>
          {!open && <span className="truncate font-mono text-neutral-500">{summary}</span>}
        </button>
        <ParentToolUseTrigger parent={parent} />
      </div>
      {open && (
        <div className="border-t border-neutral-800 px-3 pb-3 pt-2">
          {showDiff ? (
            <DiffView
              oldText={diff.oldText}
              newText={diff.newText}
              filePath={diff.filePath}
              label={diff.name}
            />
          ) : (
            <>
              <CodeBlock code={safe} lang="text" />
              {truncated && <TruncatedHint />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ParentToolUseTrigger({ parent }: { parent: { name: string; input: unknown } | null }) {
  const hasParent = parent !== null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={hasParent ? `Show parent tool_use (${parent.name})` : 'No parent tool_use'}
        title={hasParent ? `Parent: ${parent.name}` : 'No linked tool_use'}
        className={`rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wide transition-colors ${
          hasParent
            ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100'
            : 'cursor-not-allowed bg-neutral-900 text-neutral-600'
        }`}
        disabled={!hasParent}
      >
        parent
      </PopoverTrigger>
      <PopoverContent>
        {hasParent ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">parent</span>
              <span className="text-sm font-semibold text-amber-300">{parent.name}</span>
            </div>
            <PopoverInput input={parent.input} />
          </div>
        ) : (
          <div className="text-neutral-500">No linked tool_use event in this session.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PopoverInput({ input }: { input: unknown }) {
  if (input === undefined || input === null) {
    return <div className="text-neutral-500">No input.</div>;
  }
  let raw: string;
  try {
    raw = JSON.stringify(input, null, 2);
  } catch {
    raw = '[unserialisable]';
  }
  const truncated = raw.length > POPOVER_INPUT_MAX_BYTES;
  const shown = truncated ? raw.slice(0, POPOVER_INPUT_MAX_BYTES) : raw;
  return (
    <>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-200">
        {shown}
      </pre>
      {truncated && <TruncatedHint />}
    </>
  );
}

export function UserMsg({
  ev,
  registry,
  parentRegistry,
}: {
  ev: Extract<JsonlEvent, { type: 'user' }>;
  registry?: ToolUseRegistry | undefined;
  parentRegistry?: ParentToolUseRegistry | undefined;
}) {
  const blocks = splitBlocks(ev.message.content);
  return (
    <Wrapper role="user" color="text-blue-400" timestamp={ev.timestamp}>
      <Blocks
        blocks={blocks}
        markdown={false}
        registry={registry}
        parentRegistry={parentRegistry}
      />
    </Wrapper>
  );
}

export function AssistantMsg({
  ev,
  registry,
  parentRegistry,
}: {
  ev: Extract<JsonlEvent, { type: 'assistant' }>;
  registry?: ToolUseRegistry | undefined;
  parentRegistry?: ParentToolUseRegistry | undefined;
}) {
  const blocks = splitBlocks(ev.message.content);
  return (
    <Wrapper role="assistant" color="text-emerald-400" timestamp={ev.timestamp}>
      <Blocks blocks={blocks} markdown={true} registry={registry} parentRegistry={parentRegistry} />
    </Wrapper>
  );
}

export function ToolUseMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'tool_use' }> }) {
  const [open, setOpen] = useState(false);
  const name = ev.name ?? 'unknown';
  const inputStr = ev.input ? JSON.stringify(ev.input, null, 2) : '{}';
  const preview = inputStr.slice(0, 200);
  return (
    <Wrapper role="tool_use" color="text-amber-400" timestamp={ev.timestamp}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-800"
          aria-label={open ? 'Zwiń' : 'Rozwiń'}
        >
          {open ? '▼' : '▶'}
        </button>
        <span className="font-mono text-sm font-semibold text-amber-300">{name}</span>
        {!open && <span className="truncate font-mono text-xs text-neutral-500">{preview}</span>}
      </div>
      {open && <CodeBlock code={inputStr} lang="json" />}
    </Wrapper>
  );
}

export function ToolResultMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'tool_result' }> }) {
  const [open, setOpen] = useState(false);
  const r = ev.toolUseResult;
  const exit = r?.exitCode;
  const stdout = r?.stdout ?? '';
  const stderr = r?.stderr ?? '';
  const hasOutput = stdout || stderr;
  return (
    <Wrapper role="tool_result" color="text-sky-400" timestamp={ev.timestamp}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-800"
          aria-label={open ? 'Zwiń' : 'Rozwiń'}
          disabled={!hasOutput}
        >
          {open ? '▼' : hasOutput ? '▶' : ' '}
        </button>
        <span className="text-xs text-neutral-400">
          exit {typeof exit === 'number' ? exit : '—'}
        </span>
        {r?.interrupted && (
          <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-300">
            interrupted
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {stdout && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">stdout</p>
              <CodeBlock code={truncate(stdout).text} lang="text" />
            </div>
          )}
          {stderr && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-red-400">stderr</p>
              <CodeBlock code={truncate(stderr).text} lang="text" />
            </div>
          )}
        </div>
      )}
    </Wrapper>
  );
}

export function SystemMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'system' }> }) {
  return (
    <Wrapper role="system" color="text-neutral-500" timestamp={ev.timestamp}>
      <p className="text-xs text-neutral-400">
        <span className="font-mono">{ev.slug ?? ev.subtype ?? 'event'}</span>
        {typeof ev.hookCount === 'number' && (
          <span className="ml-2 text-neutral-600">hooks: {ev.hookCount}</span>
        )}
      </p>
    </Wrapper>
  );
}

export function AttachmentMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'attachment' }> }) {
  return (
    <Wrapper role="attachment" color="text-purple-400" timestamp={ev.timestamp}>
      <p className="text-xs text-neutral-300">
        <span className="font-mono">{ev.hookName ?? ev.command ?? 'hook'}</span>
        <span className="ml-2 text-neutral-500">
          exit {ev.exitCode ?? '—'} · {ev.durationMs ?? '—'} ms
        </span>
      </p>
    </Wrapper>
  );
}

export function PermissionMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'permission-mode' }> }) {
  return (
    <Wrapper role="permission" color="text-yellow-400" timestamp={ev.timestamp}>
      <p className="text-xs text-neutral-300">
        mode: <span className="font-mono text-yellow-200">{ev.mode ?? '—'}</span>
      </p>
    </Wrapper>
  );
}

export function QueueMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'queue-operation' }> }) {
  return (
    <Wrapper role="queue" color="text-neutral-600" timestamp={ev.timestamp}>
      <p className="text-xs text-neutral-500">
        op: <span className="font-mono">{ev.operation ?? '—'}</span>
      </p>
    </Wrapper>
  );
}

export function FileHistoryMsg({
  ev,
}: {
  ev: Extract<JsonlEvent, { type: 'file-history-snapshot' }>;
}) {
  return (
    <Wrapper role="snapshot" color="text-neutral-600" timestamp={ev.timestamp}>
      <p className="text-xs text-neutral-500">file history snapshot</p>
    </Wrapper>
  );
}

export function renderEvent(
  ev: JsonlEvent,
  key: number,
  registry?: ToolUseRegistry,
  parentRegistry?: ParentToolUseRegistry,
) {
  switch (ev.type) {
    case 'user':
      return <UserMsg key={key} ev={ev} registry={registry} parentRegistry={parentRegistry} />;
    case 'assistant':
      return <AssistantMsg key={key} ev={ev} registry={registry} parentRegistry={parentRegistry} />;
    case 'tool_use':
      return <ToolUseMsg key={key} ev={ev} />;
    case 'tool_result':
      return <ToolResultMsg key={key} ev={ev} />;
    case 'system':
      return <SystemMsg key={key} ev={ev} />;
    case 'attachment':
      return <AttachmentMsg key={key} ev={ev} />;
    case 'permission-mode':
      return <PermissionMsg key={key} ev={ev} />;
    case 'queue-operation':
      return <QueueMsg key={key} ev={ev} />;
    case 'file-history-snapshot':
      return <FileHistoryMsg key={key} ev={ev} />;
  }
}

function TruncatedHint() {
  return <p className="mt-2 text-xs text-amber-400">Treść przycięta do 10 MB (render limit).</p>;
}
