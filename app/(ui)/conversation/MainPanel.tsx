'use client';

import { useEffect } from 'react';

import { useUiStore } from '@/stores/ui-slice';
import { useProjects } from '@/hooks/use-projects';
import { useTerminalStore } from '@/stores/terminal-slice';
import { CHButton } from '@/components/ui/ch-button';
import { Kbd } from '@/components/ui/kbd';
import {
  IconSearch,
  IconTerm,
  IconEdit,
  IconHistory,
  IconHelp,
  IconSettings,
} from '@/components/ui/icons';
import { Viewer } from './Viewer';
import { FocusToggle } from './FocusToggle';
import { TabBar } from '@/app/(ui)/terminal/TabBar';
import { TabManager } from '@/app/(ui)/terminal/TabManager';
import { QuickActions } from '@/app/(ui)/terminal/QuickActions';
import { LayoutPicker } from '@/components/terminal/LayoutPicker';
import { MarkdownEditor } from '@/app/(ui)/editor/MarkdownEditor';
import { paletteOpenEvent, helpOpenEvent, settingsOpenEvent } from '@/lib/ui/overlay-events';
import { cn } from '@/lib/utils';

type Mode = 'viewer' | 'terminal' | 'editor';

export function MainPanel() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const editorOpen = useUiStore((s) => s.editorOpen);
  const focusMode = useUiStore((s) => s.focusMode);
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
      aliasKey: `shell:${activeProject.slug}:${activeProject.resolvedCwd}`,
    });
    if (id) openTerminal(activeProject.resolvedCwd);
  };

  useEffect(() => {
    if (!focusMode) return;
    const uiState = useUiStore.getState();
    const termState = useTerminalStore.getState();
    if (uiState.editorOpen) uiState.closeEditor();
    if (termState.tabs.length > 0) {
      if (!uiState.terminalOpen) {
        uiState.openTerminal(termState.tabs[0]?.cwd ?? '/');
      }
      return;
    }
    if (activeProject?.resolvedCwd) {
      const id = termState.openTab({
        projectSlug: activeProject.slug,
        cwd: activeProject.resolvedCwd,
        title: `shell (${activeProject.slug.slice(-24)})`,
        aliasKey: `shell:${activeProject.slug}:${activeProject.resolvedCwd}`,
      });
      if (id) uiState.openTerminal(activeProject.resolvedCwd);
    }
  }, [focusMode, activeProject]);

  const mode: Mode = editorOpen
    ? 'editor'
    : terminalOpen && tabs.length > 0
      ? 'terminal'
      : 'viewer';

  const setMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'viewer') {
      closeEditor();
      if (terminalOpen) closeTerminal();
      return;
    }
    if (next === 'terminal') {
      closeEditor();
      if (tabs.length === 0) newShellTab();
      else openTerminal(tabs[0]?.cwd ?? '/');
      return;
    }
    if (next === 'editor') {
      if (terminalOpen) closeTerminal();
      openEditor();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="main-head">
        {!focusMode && (
          <div className="seg" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'viewer'}
              className={cn(mode === 'viewer' && 'on')}
              onClick={() => setMode('viewer')}
            >
              <IconHistory /> History
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'terminal'}
              className={cn(mode === 'terminal' && 'on')}
              onClick={() => setMode('terminal')}
              disabled={!activeProject?.resolvedCwd && tabs.length === 0}
              title={
                !activeProject?.resolvedCwd && tabs.length === 0
                  ? 'Pick a project to open a terminal'
                  : 'Switch to terminal'
              }
            >
              <IconTerm /> Terminal
              <span className="pill">{tabs.length}/16</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'editor'}
              className={cn(mode === 'editor' && 'on')}
              onClick={() => setMode('editor')}
            >
              <IconEdit /> CLAUDE.md
            </button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <FocusToggle />
        <CHButton
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new Event(paletteOpenEvent))}
          title="Command palette"
        >
          <IconSearch /> jump to anything <Kbd>⌘K</Kbd>
        </CHButton>
        <CHButton
          size="sm"
          variant="outline"
          onClick={() => window.dispatchEvent(new Event(helpOpenEvent))}
          title="Keyboard shortcuts"
        >
          <IconHelp />
        </CHButton>
        <CHButton
          size="sm"
          variant="outline"
          onClick={() => window.dispatchEvent(new Event(settingsOpenEvent))}
          title="Settings"
        >
          <IconSettings />
        </CHButton>
      </header>
      {mode === 'terminal' && (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <TabBar onNewTab={newShellTab} />
            </div>
            <LayoutPicker />
          </div>
          <QuickActions />
        </>
      )}
      <div className="min-h-0 flex-1">
        {mode === 'terminal' ? <TabManager /> : mode === 'editor' ? <MarkdownEditor /> : <Viewer />}
      </div>
    </div>
  );
}
