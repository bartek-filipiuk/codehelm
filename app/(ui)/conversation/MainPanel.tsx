'use client';

import { useUiStore } from '@/stores/ui-slice';
import { useProjects } from '@/hooks/use-projects';
import { useTerminalStore } from '@/stores/terminal-slice';
import { Button } from '@/components/ui/button';
import { Viewer } from './Viewer';
import { TabBar } from '@/app/(ui)/terminal/TabBar';
import { TabManager } from '@/app/(ui)/terminal/TabManager';
import { QuickActions } from '@/app/(ui)/terminal/QuickActions';
import { MarkdownEditor } from '@/app/(ui)/editor/MarkdownEditor';

type Mode = 'viewer' | 'terminal' | 'editor';

export function MainPanel() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const editorOpen = useUiStore((s) => s.editorOpen);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const closeTerminal = useUiStore((s) => s.closeTerminal);
  const openEditor = useUiStore((s) => s.openEditor);
  const closeEditor = useUiStore((s) => s.closeEditor);
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
    : terminalOpen && tabs.length > 0
      ? 'terminal'
      : 'viewer';

  const headerTitle = {
    viewer: 'History',
    terminal: `Terminal · ${tabs.length}/16`,
    editor: 'CLAUDE.md',
  }[mode];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-medium">{headerTitle}</h2>
        <div className="flex items-center gap-2">
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
                ? `New shell in ${activeProject.resolvedCwd}`
                : 'Pick a project to open a terminal'
            }
          >
            + shell
          </Button>
          {mode === 'terminal' ? (
            <Button size="sm" variant="ghost" onClick={closeTerminal}>
              Show history
            </Button>
          ) : mode === 'editor' ? null : (
            tabs.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => openTerminal(tabs[0]?.cwd ?? '/')}>
                Show terminal ({tabs.length})
              </Button>
            )
          )}
        </div>
      </header>
      {mode === 'terminal' && (
        <>
          <TabBar onNewTab={newShellTab} />
          <QuickActions />
        </>
      )}
      <div className="min-h-0 flex-1">
        {mode === 'terminal' ? <TabManager /> : mode === 'editor' ? <MarkdownEditor /> : <Viewer />}
      </div>
    </div>
  );
}
