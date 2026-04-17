'use client';

import { useState } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAliases, useSetAlias } from '@/hooks/use-aliases';
import { useUiStore } from '@/stores/ui-slice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toastError, toastSuccess } from '@/lib/ui/toast';

/**
 * Keyed wrapper — remounts on slug change so local draft state resets
 * without needing setState-in-effect (lints cleanly and avoids stale
 * drafts leaking between projects).
 */
export function ProjectHeaderWrapper() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  if (!slug) return null;
  return <ProjectHeader key={slug} />;
}

/**
 * Shown above the session list whenever a project is selected. Displays the
 * project's alias (or path fallback) and lets the user rename it inline.
 * Empty alias clears the override.
 */
export function ProjectHeader() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const { data: projects } = useProjects();
  const { data: aliases } = useAliases();
  const setAlias = useSetAlias();

  const project = projects?.find((p) => p.slug === slug);
  const alias = slug ? aliases?.[slug] : undefined;
  const path = project?.resolvedCwd ?? project?.displayPath ?? slug ?? '';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias ?? '');

  if (!slug) return null;

  const commit = () => {
    if (!slug) return;
    const value = draft.trim();
    if (value === (alias ?? '')) {
      setEditing(false);
      return;
    }
    setAlias.mutate(
      { slug, alias: value === '' ? null : value },
      {
        onSuccess: () => {
          setEditing(false);
          toastSuccess(value === '' ? 'Alias usunięty' : 'Alias zaktualizowany', {
            id: 'project-alias',
          });
        },
        onError: (err) => {
          toastError('Nie udało się zapisać aliasu', {
            id: 'project-alias',
            description: err.message,
          });
        },
      },
    );
  };

  return (
    <div className="border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      {editing ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={draft}
              placeholder={path ?? 'Nazwa projektu'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              className="h-7 text-xs"
              aria-label="Alias projektu"
            />
            <Button size="sm" variant="ghost" onClick={commit} disabled={setAlias.isPending}>
              ✓
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              ✕
            </Button>
          </div>
          <p className="text-[10px] text-neutral-500">
            Enter = zapisz · Esc = anuluj · puste = usuń alias
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {alias ? (
              <>
                <div className="truncate text-sm font-semibold text-neutral-100">{alias}</div>
                <div className="truncate font-mono text-[10px] text-neutral-500" title={path}>
                  {path}
                </div>
              </>
            ) : (
              <div className="truncate font-mono text-xs text-neutral-300" title={path}>
                {path}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(alias ?? '');
              setEditing(true);
            }}
            title="Zmień nazwę projektu (alias)"
          >
            ✎ rename
          </Button>
        </div>
      )}
    </div>
  );
}
