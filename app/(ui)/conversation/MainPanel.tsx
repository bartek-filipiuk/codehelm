'use client';

import { useUiStore } from '@/stores/ui-slice';
import { useProjects } from '@/hooks/use-projects';
import { useTerminalStore } from '@/stores/terminal-slice';
import { Button } from '@/components/ui/button';
import { Viewer } from './Viewer';
import { Graph } from './Graph';
import { TabBar } from '@/app/(ui)/terminal/TabBar';
import { TabManager } from '@/app/(ui)/terminal/TabManager';
import { MarkdownEditor } from '@/app/(ui)/editor/MarkdownEditor';

type Mode = 'viewer' | 'terminal' | 'editor' | 'graph';

export function MainPanel() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const editorOpen = useUiStore((s) => s.editorOpen);
  const graphOpen = useUiStore((s) => s.graphOpen);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const closeTerminal = useUiStore((s) => s.closeTerminal);
  const openEditor = useUiStore((s) => s.openEditor);
  const closeEditor = useUiStore((s) => s.closeEditor);
  const openGraph = useUiStore((s) => s.openGraph);
  const closeGraph = useUiStore((s) => s.closeGraph);
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const tabs = useTerminalStore((s) => s.tabs);
  const openTab = useTerminalStore((s) => s.openTab);
  const { data: projects } = useProjects();

  const activeProject = projects?.find((p) => p.slug === projectSlug);

  const newShellTab = () => {
    if (!activeProject?.resolvedCwd) return;
    const id = openTab({
      projectSlug: activeProject.slug,
      cwd: activeProject.resolvedCwd,
      title: `shell (${activeProject.slug.slice(-24)})`,
    });
    if (id) openTerminal(activeProject.resolvedCwd);
  };

  const mode: Mode = editorOpen
    ? 'editor'
    : graphOpen
      ? 'graph'
      : terminalOpen && tabs.length > 0
        ? 'terminal'
        : 'viewer';

  const headerTitle = {
    viewer: 'Historia',
    terminal: `Terminal · ${tabs.length}/16`,
    editor: 'CLAUDE.md',
    graph: 'Graf rozmowy',
  }[mode];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-medium">{headerTitle}</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'graph' ? 'secondary' : 'outline'}
            disabled={!sessionId}
            onClick={() => (mode === 'graph' ? closeGraph() : openGraph())}
            title={sessionId ? 'Widok grafu rozmowy' : 'Wybierz sesję'}
          >
            Graph
          </Button>
          <Button
            size="sm"
            variant={mode === 'editor' ? 'secondary' : 'outline'}
            onClick={() => (mode === 'editor' ? closeEditor() : openEditor())}
          >
            CLAUDE.md
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!activeProject?.resolvedCwd}
            onClick={newShellTab}
            title={
              activeProject?.resolvedCwd
                ? `Nowy shell w ${activeProject.resolvedCwd}`
                : 'Wybierz projekt aby otworzyć terminal'
            }
          >
            + shell
          </Button>
          {mode === 'terminal' ? (
            <Button size="sm" variant="ghost" onClick={closeTerminal}>
              Pokaż historię
            </Button>
          ) : mode === 'editor' ? null : (
            tabs.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => openTerminal(tabs[0]?.cwd ?? '/')}>
                Pokaż terminal ({tabs.length})
              </Button>
            )
          )}
        </div>
      </header>
      {mode === 'terminal' && <TabBar onNewTab={newShellTab} />}
      <div className="min-h-0 flex-1">
        {mode === 'terminal' ? (
          <TabManager />
        ) : mode === 'editor' ? (
          <MarkdownEditor />
        ) : mode === 'graph' ? (
          <Graph />
        ) : (
          <Viewer />
        )}
      </div>
    </div>
  );
}
