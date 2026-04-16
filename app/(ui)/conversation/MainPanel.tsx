'use client';

import { useUiStore } from '@/stores/ui-slice';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Viewer } from './Viewer';
import { Terminal } from '@/app/(ui)/terminal/Terminal';

/**
 * Right-side panel. Shows the Viewer by default; swaps to an embedded terminal
 * when the user opens one. Terminal cwd is the project's resolved working
 * directory (falls back to $HOME in the server if not under $HOME).
 */
export function MainPanel() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const terminalCwd = useUiStore((s) => s.terminalCwd);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const closeTerminal = useUiStore((s) => s.closeTerminal);
  const { data: projects } = useProjects();

  const activeProject = projects?.find((p) => p.slug === projectSlug);
  const canOpenTerminal = !!activeProject?.resolvedCwd;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-medium">{terminalOpen ? 'Terminal' : 'Historia'}</h2>
        <div className="flex items-center gap-2">
          {!terminalOpen ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canOpenTerminal}
              onClick={() => activeProject?.resolvedCwd && openTerminal(activeProject.resolvedCwd)}
              title={
                canOpenTerminal
                  ? `Otwórz terminal w ${activeProject?.resolvedCwd}`
                  : 'Wybierz projekt (i upewnij się że ma resolved cwd)'
              }
            >
              Terminal
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={closeTerminal}>
              Zamknij terminal
            </Button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {terminalOpen && terminalCwd ? <Terminal key={terminalCwd} cwd={terminalCwd} /> : <Viewer />}
      </div>
    </div>
  );
}
