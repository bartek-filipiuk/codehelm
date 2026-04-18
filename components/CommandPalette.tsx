'use client';

import * as React from 'react';
import { useProjects, type ProjectSummary } from '@/hooks/use-projects';
import { useProjectMeta } from '@/hooks/use-project-meta';
import { useUiStore } from '@/stores/ui-slice';
import { useTerminalStore } from '@/stores/terminal-slice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  VisuallyHidden,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { IconSearch } from '@/components/ui/icons';
import { isPaletteHotkey } from '@/lib/ui/command-palette-hotkey';
import { paletteOpenEvent } from '@/lib/ui/overlay-events';
import { toastInfo } from '@/lib/ui/toast';

export interface PaletteProject {
  slug: string;
  alias?: string;
  displayPath: string;
  resolvedCwd: string | null;
  lastActivityTs: number;
}

export function toPaletteProjects(
  projects: ProjectSummary[],
  meta: Record<string, { alias?: string; favorite?: boolean }>,
): PaletteProject[] {
  return projects.map((project) => {
    const alias = meta[project.slug]?.alias;
    const base: PaletteProject = {
      slug: project.slug,
      displayPath: project.displayPath ?? project.slug,
      resolvedCwd: project.resolvedCwd,
      lastActivityTs: project.lastActivity ? Date.parse(project.lastActivity) : 0,
    };
    return alias ? { ...base, alias } : base;
  });
}

export function sortByActivityDesc(list: PaletteProject[]): PaletteProject[] {
  return [...list].sort((a, b) => b.lastActivityTs - a.lastActivityTs);
}

export function sortByAliasAsc(list: PaletteProject[]): PaletteProject[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  return [...list].sort((a, b) => {
    const an = a.alias ?? a.displayPath ?? a.slug;
    const bn = b.alias ?? b.displayPath ?? b.slug;
    return collator.compare(an, bn);
  });
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const { data: projects } = useProjects();
  const { data: meta } = useProjectMeta();
  const selectedSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelected = useUiStore((s) => s.setSelectedProject);
  const openEditor = useUiStore((s) => s.openEditor);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const openTab = useTerminalStore((s) => s.openTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const activeTabId = useTerminalStore((s) => s.activeTabId);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isPaletteHotkey(event)) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener(paletteOpenEvent, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(paletteOpenEvent, onOpen);
    };
  }, []);

  const paletteProjects = React.useMemo(
    () => toPaletteProjects(projects ?? [], meta ?? {}),
    [projects, meta],
  );
  const recent = React.useMemo(
    () => sortByActivityDesc(paletteProjects).slice(0, 5),
    [paletteProjects],
  );
  const alphabetical = React.useMemo(() => sortByAliasAsc(paletteProjects), [paletteProjects]);

  const activeProject = paletteProjects.find((p) => p.slug === selectedSlug) ?? null;

  const selectProject = (slug: string) => {
    setSelected(slug);
    setOpen(false);
  };

  const newShellHere = () => {
    if (!activeProject?.resolvedCwd) return;
    const id = openTab({
      projectSlug: activeProject.slug,
      cwd: activeProject.resolvedCwd,
      title: `shell (${activeProject.slug.slice(-24)})`,
      aliasKey: `shell:${activeProject.slug}:${activeProject.resolvedCwd}`,
    });
    if (id) openTerminal(activeProject.resolvedCwd);
    setOpen(false);
  };

  const openGlobalClaudeMd = () => {
    setSelected(null);
    openEditor();
    setOpen(false);
  };

  const openProjectClaudeMd = () => {
    if (!activeProject) return;
    openEditor();
    setOpen(false);
  };

  const closeCurrentTab = () => {
    if (!activeTabId) return;
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === activeTabId);
    closeTab(activeTabId);
    toastInfo('Tab closed', {
      id: `tab-closed-${activeTabId}`,
      ...(tab?.title ? { description: tab.title } : {}),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent bare hideClose className="ch-modal" data-testid="command-palette">
        <VisuallyHidden>
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Quickly jump to a project or run an action. Use arrow keys and Enter.
          </DialogDescription>
        </VisuallyHidden>
        <Command label="Command palette">
          <div className="cmd-search">
            <IconSearch style={{ color: 'var(--fg-3)' }} />
            <CommandInput placeholder="Type a command, or search…" />
            <Kbd>esc</Kbd>
          </div>
          <CommandList className="modal-body">
            <CommandEmpty>
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-3)' }}>
                No matches.
              </div>
            </CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem
                value="new shell current project shell terminal"
                onSelect={newShellHere}
                disabled={!activeProject?.resolvedCwd}
                className="cmd-item"
              >
                <span className="glyph">+</span>
                <span className="lbl">New shell in current project</span>
                <span className="sub">Ctrl+T</span>
              </CommandItem>
              <CommandItem
                value="open claude md current project"
                onSelect={openProjectClaudeMd}
                disabled={!activeProject}
                className="cmd-item"
              >
                <span className="glyph">✎</span>
                <span className="lbl">Open CLAUDE.md (current project)</span>
                <span className="sub" />
              </CommandItem>
              <CommandItem
                value="open claude md global"
                onSelect={openGlobalClaudeMd}
                className="cmd-item"
              >
                <span className="glyph">✎</span>
                <span className="lbl">Open CLAUDE.md (global)</span>
                <span className="sub" />
              </CommandItem>
              <CommandItem
                value="close tab terminal current"
                onSelect={closeCurrentTab}
                disabled={!activeTabId}
                className="cmd-item"
              >
                <span className="glyph">×</span>
                <span className="lbl">Close current terminal tab</span>
                <span className="sub">Ctrl+W</span>
              </CommandItem>
            </CommandGroup>
            {recent.length > 0 && (
              <CommandGroup heading="Recent projects">
                {recent.map((p) => (
                  <CommandItem
                    key={`recent-${p.slug}`}
                    value={`recent ${p.alias ?? ''} ${p.displayPath} ${p.slug}`}
                    onSelect={() => selectProject(p.slug)}
                    className="cmd-item"
                  >
                    <span className="glyph">▸</span>
                    <span className="lbl">{p.alias ?? p.displayPath}</span>
                    <span className="sub">{p.displayPath}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {alphabetical.length > 0 && (
              <CommandGroup heading="All projects">
                {alphabetical.map((p) => (
                  <CommandItem
                    key={`all-${p.slug}`}
                    value={`project ${p.alias ?? ''} ${p.displayPath} ${p.slug}`}
                    onSelect={() => selectProject(p.slug)}
                    className="cmd-item"
                  >
                    <span className="glyph">▸</span>
                    <span className="lbl">{p.alias ?? p.displayPath}</span>
                    <span className="sub">{p.displayPath}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="modal-foot">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>navigate</span>
            <span style={{ marginLeft: 14 }}>
              <Kbd>↵</Kbd> select
            </span>
            <span style={{ marginLeft: 'auto' }}>codehelm · command palette</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
