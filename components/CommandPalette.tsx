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
import { isPaletteHotkey } from '@/lib/ui/command-palette-hotkey';
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    toastInfo('Zakładka zamknięta', {
      id: `tab-closed-${activeTabId}`,
      ...(tab?.title ? { description: tab.title } : {}),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-xl overflow-hidden p-0"
        hideClose
        data-testid="command-palette"
      >
        <VisuallyHidden>
          <DialogTitle>Paleta poleceń</DialogTitle>
          <DialogDescription>
            Szybki wybór projektu lub akcji. Użyj strzałek i Enter.
          </DialogDescription>
        </VisuallyHidden>
        <Command label="Paleta poleceń">
          <CommandInput placeholder="Szukaj polecenia lub projektu…" />
          <CommandList>
            <CommandEmpty>Brak dopasowań.</CommandEmpty>
            <CommandGroup heading="Akcje">
              <CommandItem
                value="new shell bieżący projekt shell terminal"
                onSelect={newShellHere}
                disabled={!activeProject?.resolvedCwd}
              >
                Nowy shell w bieżącym projekcie
              </CommandItem>
              <CommandItem
                value="open claude md bieżący projekt"
                onSelect={openProjectClaudeMd}
                disabled={!activeProject}
              >
                Otwórz CLAUDE.md (bieżący projekt)
              </CommandItem>
              <CommandItem value="open claude md globalny global" onSelect={openGlobalClaudeMd}>
                Otwórz CLAUDE.md (globalny)
              </CommandItem>
              <CommandItem
                value="zamknij kartę terminala close current tab"
                onSelect={closeCurrentTab}
                disabled={!activeTabId}
              >
                Zamknij bieżącą kartę terminala
              </CommandItem>
            </CommandGroup>
            {recent.length > 0 && (
              <CommandGroup heading="Ostatnie projekty">
                {recent.map((p) => (
                  <CommandItem
                    key={`recent-${p.slug}`}
                    value={`recent ${p.alias ?? ''} ${p.displayPath} ${p.slug}`}
                    onSelect={() => selectProject(p.slug)}
                  >
                    {paletteLabel(p)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {alphabetical.length > 0 && (
              <CommandGroup heading="Wszystkie projekty">
                {alphabetical.map((p) => (
                  <CommandItem
                    key={`all-${p.slug}`}
                    value={`project ${p.alias ?? ''} ${p.displayPath} ${p.slug}`}
                    onSelect={() => selectProject(p.slug)}
                  >
                    {paletteLabel(p)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function paletteLabel(p: PaletteProject): string {
  if (p.alias) return `${p.alias} — ${p.displayPath}`;
  return p.displayPath;
}
