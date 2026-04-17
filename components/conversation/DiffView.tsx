'use client';

import { diffLines } from 'diff';
import { useMemo } from 'react';

const MAX_DIFF_BYTES = 500_000;

export interface DiffViewProps {
  oldText: string;
  newText: string;
  filePath?: string | null;
  /** Label for the operation (e.g. "Edit", "Write"). */
  label?: string;
}

function safeSlice(s: string): string {
  if (s.length <= MAX_DIFF_BYTES) return s;
  return s.slice(0, MAX_DIFF_BYTES);
}

export function DiffView({ oldText, newText, filePath, label }: DiffViewProps) {
  const parts = useMemo(() => {
    const a = safeSlice(oldText ?? '');
    const b = safeSlice(newText ?? '');
    return diffLines(a, b);
  }, [oldText, newText]);

  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.added) added += p.count ?? 0;
    else if (p.removed) removed += p.count ?? 0;
  }

  return (
    <div
      className="overflow-x-auto rounded-md border border-neutral-800 bg-neutral-950 font-mono text-xs"
      data-testid="diff-view"
    >
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-[10px]">
        {label && <span className="uppercase tracking-wider text-neutral-400">{label}</span>}
        {filePath && (
          <span className="truncate font-mono text-neutral-300" title={filePath}>
            {filePath}
          </span>
        )}
        <span className="ml-auto flex gap-2">
          <span className="text-emerald-400">+{added}</span>
          <span className="text-red-400">-{removed}</span>
        </span>
      </div>
      <div className="py-1">
        {parts.map((part, i) => {
          const rowClass = part.added
            ? 'bg-emerald-950/40 text-emerald-200 diff-added'
            : part.removed
              ? 'bg-red-950/40 text-red-200 diff-removed'
              : 'text-neutral-400 diff-context';
          const prefix = part.added ? '+' : part.removed ? '-' : ' ';
          const raw = part.value;
          const lines = raw.split('\n');
          if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
          return (
            <div key={i}>
              {lines.map((line, j) => (
                <div key={j} className={`${rowClass} whitespace-pre-wrap break-words px-3`}>
                  <span className="mr-2 select-none opacity-60">{prefix}</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
