'use client';

import { useCallback, useMemo } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { Terminal } from '@/app/(ui)/terminal/Terminal';
import { useTerminalStore, type TerminalTab } from '@/stores/terminal-slice';
import { loadPaneSizes, savePaneSizes } from '@/lib/ui/pane-sizes';
import { cn } from '@/lib/utils';

interface Props {
  tab: TerminalTab;
}

const SEP_BASE =
  'bg-[var(--line)] transition-colors data-[state=hover]:bg-[var(--line-3)] data-[state=dragging]:bg-[var(--gold-700)]';
const SEP_H = `${SEP_BASE} w-[4px] cursor-col-resize`;
const SEP_V = `${SEP_BASE} h-[4px] cursor-row-resize`;

function PaneSlot({ tab, paneId }: { tab: TerminalTab; paneId: string }) {
  const pane = tab.panes.find((p) => p.id === paneId);
  const setActivePane = useTerminalStore((s) => s.setActivePane);
  const closePane = useTerminalStore((s) => s.closePane);
  if (!pane) return null;
  const isActive = paneId === tab.activePaneId;
  const showClose = tab.panes.length > 1;
  return (
    <div
      className={cn(
        'group relative h-full w-full',
        isActive && 'outline outline-2 outline-[var(--gold-700)] outline-offset-[-2px]',
      )}
      onPointerDownCapture={() => setActivePane(tab.id, paneId)}
      data-active={isActive}
      data-pane-id={paneId}
    >
      <Terminal
        cwd={pane.cwd}
        paneId={paneId}
        {...(pane.shell ? { shell: pane.shell } : {})}
        {...(pane.args ? { args: pane.args } : {})}
        {...(pane.initCommand ? { initCommand: pane.initCommand } : {})}
      />
      {showClose && (
        <button
          type="button"
          aria-label="Close pane"
          className="absolute right-1 top-1 z-20 rounded bg-black/40 px-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            closePane(tab.id, paneId);
          }}
        >
          x
        </button>
      )}
    </div>
  );
}

function broadcastResizeEnd(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('codehelm:pane-resize-end'));
  }
}

export function PaneGrid({ tab }: Props) {
  const { layout, panes } = tab;

  const stored = useMemo(() => loadPaneSizes(layout), [layout]);

  const onPairChanged = useCallback(
    (arr: Layout) => {
      const vals = Object.values(arr);
      savePaneSizes(layout, vals);
      broadcastResizeEnd();
    },
    [layout],
  );

  if (layout === 'single' || panes.length === 1) {
    const only = panes[0];
    if (!only) return null;
    return <PaneSlot tab={tab} paneId={only.id} />;
  }

  if (layout === 'h' || layout === 'v') {
    const orientation = layout === 'h' ? 'horizontal' : 'vertical';
    const a = stored?.[0] ?? 50;
    const b = stored?.[1] ?? 50;
    const p0 = panes[0];
    const p1 = panes[1];
    if (!p0 || !p1) return null;
    return (
      <Group
        orientation={orientation}
        onLayoutChanged={onPairChanged}
        className="h-full w-full"
      >
        <Panel id={p0.id} defaultSize={a} minSize={15}>
          <PaneSlot tab={tab} paneId={p0.id} />
        </Panel>
        <Separator className={orientation === 'horizontal' ? SEP_H : SEP_V} />
        <Panel id={p1.id} defaultSize={b} minSize={15}>
          <PaneSlot tab={tab} paneId={p1.id} />
        </Panel>
      </Group>
    );
  }

  // Quad: vertical outer, two horizontal inners.
  // Sizes order: [topA, topB, bottomA, bottomB, rowTop, rowBottom].
  const s = stored ?? [50, 50, 50, 50, 50, 50];
  const persistSlot = (indices: [number, number]) => (arr: Layout) => {
    const cur = loadPaneSizes('quad') ?? [50, 50, 50, 50, 50, 50];
    const next = cur.slice();
    const vals = Object.values(arr);
    next[indices[0]] = vals[0] ?? 50;
    next[indices[1]] = vals[1] ?? 50;
    savePaneSizes('quad', next);
    broadcastResizeEnd();
  };
  const [p0, p1, p2, p3] = panes;
  if (!p0 || !p1 || !p2 || !p3) return null;
  return (
    <Group
      orientation="vertical"
      onLayoutChanged={persistSlot([4, 5])}
      className="h-full w-full"
    >
      <Panel id={`${p0.id}-row`} defaultSize={s[4] ?? 50} minSize={15}>
        <Group
          orientation="horizontal"
          onLayoutChanged={persistSlot([0, 1])}
          className="h-full w-full"
        >
          <Panel id={p0.id} defaultSize={s[0] ?? 50} minSize={15}>
            <PaneSlot tab={tab} paneId={p0.id} />
          </Panel>
          <Separator className={SEP_H} />
          <Panel id={p1.id} defaultSize={s[1] ?? 50} minSize={15}>
            <PaneSlot tab={tab} paneId={p1.id} />
          </Panel>
        </Group>
      </Panel>
      <Separator className={SEP_V} />
      <Panel id={`${p2.id}-row`} defaultSize={s[5] ?? 50} minSize={15}>
        <Group
          orientation="horizontal"
          onLayoutChanged={persistSlot([2, 3])}
          className="h-full w-full"
        >
          <Panel id={p2.id} defaultSize={s[2] ?? 50} minSize={15}>
            <PaneSlot tab={tab} paneId={p2.id} />
          </Panel>
          <Separator className={SEP_H} />
          <Panel id={p3.id} defaultSize={s[3] ?? 50} minSize={15}>
            <PaneSlot tab={tab} paneId={p3.id} />
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}
