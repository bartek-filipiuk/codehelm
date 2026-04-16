'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUiStore } from '@/stores/ui-slice';
import { useClaudeMd, useSaveClaudeMd } from '@/hooks/use-claude-md';

type EditorTarget = 'project' | 'global';

/**
 * CodeMirror 6 editor for CLAUDE.md files. Toggle between the active project's
 * per-project file and the global ~/.claude/CLAUDE.md. Save via button or
 * Ctrl+S — conflict (412) flags the user so they can choose to reload.
 */
export function MarkdownEditor() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const [target, setTarget] = useState<EditorTarget>(projectSlug ? 'project' : 'global');
  const effectiveSlug = target === 'project' ? projectSlug : null;
  const query = useClaudeMd(effectiveSlug);
  const save = useSaveClaudeMd(effectiveSlug);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<unknown>(null);
  const setDocRef = useRef<((text: string) => void) | null>(null);
  const getDocRef = useRef<(() => string) | null>(null);
  const [mounted, setMounted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastMtime, setLastMtime] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    (async () => {
      const [
        { EditorView, keymap, lineNumbers },
        { EditorState },
        { markdown },
        { oneDark },
        { defaultKeymap, history, historyKeymap },
      ] = await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/lang-markdown'),
        import('@codemirror/theme-one-dark'),
        import('@codemirror/commands'),
      ]);
      if (cancelled || !hostRef.current) return;

      const updateListener = EditorView.updateListener.of((u) => {
        if (u.docChanged) setDirty(true);
      });

      const state = EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          history(),
          markdown(),
          oneDark,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          updateListener,
        ],
      });
      const view = new EditorView({ state, parent: hostRef.current });
      viewRef.current = view;
      setDocRef.current = (text: string) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      };
      getDocRef.current = () => view.state.doc.toString();
      setMounted(true);
    })();
    return () => {
      cancelled = true;
      const view = viewRef.current as { destroy?: () => void } | null;
      view?.destroy?.();
      viewRef.current = null;
      setDocRef.current = null;
      getDocRef.current = null;
    };
  }, []);

  // Load new doc into the editor whenever the target changes or query finishes.
  useEffect(() => {
    if (!mounted || !query.data || !setDocRef.current) return;
    setDocRef.current(query.data.content);
    setLastMtime(query.data.mtime);
    setDirty(false);
    setConflict(false);
    setError(null);
  }, [mounted, query.data]);

  const doSave = async () => {
    if (!getDocRef.current || save.isPending) return;
    setError(null);
    setConflict(false);
    try {
      const res = await save.mutateAsync({
        content: getDocRef.current(),
        ifUnmodifiedSince: lastMtime,
      });
      setLastMtime(res.mtime);
      setDirty(false);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'conflict') setConflict(true);
      else setError(e.code ?? 'save_failed');
    }
  };

  // Ctrl+S / Cmd+S.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void doSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // doSave is referentially unstable — we intentionally capture the current closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, save.isPending, lastMtime]);

  const isLoading = query.isLoading || !mounted;
  const canSwitchProject = !!projectSlug;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={target === 'project' ? 'secondary' : 'ghost'}
            onClick={() => setTarget('project')}
            disabled={!canSwitchProject}
          >
            Per-project
          </Button>
          <Button
            size="sm"
            variant={target === 'global' ? 'secondary' : 'ghost'}
            onClick={() => setTarget('global')}
          >
            Global
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="truncate font-mono text-[10px] text-neutral-500"
            title={query.data?.path}
          >
            {query.data?.path ?? ''}
          </span>
          {dirty && <span className="text-[10px] text-amber-400">● unsaved</span>}
          {!dirty && lastMtime && <span className="text-[10px] text-neutral-500">Saved</span>}
          <Button size="sm" onClick={doSave} disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save (Ctrl+S)'}
          </Button>
        </div>
      </div>
      {conflict && (
        <div className="border-b border-amber-800 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
          Plik zmienił się na dysku. Kliknij &quot;Reload&quot; aby pobrać najnowszą wersję
          (stracisz bieżące edycje).
          <Button size="sm" variant="outline" className="ml-2" onClick={() => query.refetch()}>
            Reload
          </Button>
        </div>
      )}
      {error && (
        <div className="border-b border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-200">
          Błąd zapisu: {error}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {/* Host is always in the DOM so CodeMirror's mount-time effect has
            a real element to attach to. Skeleton overlays while loading. */}
        <div
          ref={hostRef}
          className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
        />
        {isLoading && (
          <div className="absolute inset-0 flex flex-col gap-2 bg-neutral-950 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
