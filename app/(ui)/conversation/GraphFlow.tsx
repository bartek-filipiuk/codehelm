'use client';

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { buildConversationGraph, type GraphNode } from '@/lib/conversation/graph-build';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { useUiStore } from '@/stores/ui-slice';
import { cn } from '@/lib/utils';

interface NodeData {
  node: GraphNode;
  onJump: (index: number) => void;
}

const NODE_WIDTH: Record<GraphNode['kind'], number> = {
  user: 220,
  assistant: 240,
  tool: 160,
};
const NODE_HEIGHT: Record<GraphNode['kind'], number> = {
  user: 60,
  assistant: 60,
  tool: 40,
};

const NODE_COLORS: Record<GraphNode['kind'], string> = {
  user: 'border-blue-700 bg-blue-950/60 text-blue-100',
  assistant: 'border-emerald-700 bg-emerald-950/60 text-emerald-100',
  tool: 'border-amber-700 bg-amber-950/50 text-amber-100',
};

function ConversationNode({ data }: NodeProps<NodeData>) {
  const { node, onJump } = data;
  const width = NODE_WIDTH[node.kind];
  const height = NODE_HEIGHT[node.kind];
  return (
    <button
      type="button"
      onClick={() => onJump(node.eventIndex)}
      className={cn(
        'rounded-md border px-3 py-1.5 text-left text-[11px] shadow-sm transition hover:brightness-125',
        NODE_COLORS[node.kind],
      )}
      style={{ width, height }}
      title={node.label}
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-neutral-500" />
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide opacity-70">
        <span>{node.kind}</span>
        {node.toolName && <span className="font-mono">{node.toolName}</span>}
      </div>
      <div className="mt-0.5 truncate font-medium">{node.label}</div>
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-neutral-500" />
    </button>
  );
}

const nodeTypes = { conversation: ConversationNode };

function layout(
  graphNodes: GraphNode[],
  graphEdges: Array<{ id: string; source: string; target: string; dashed?: boolean }>,
  onJump: (index: number) => void,
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 48 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graphNodes) {
    g.setNode(n.id, { width: NODE_WIDTH[n.kind], height: NODE_HEIGHT[n.kind] });
  }
  for (const e of graphEdges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: Node<NodeData>[] = graphNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'conversation',
      position: { x: pos.x - NODE_WIDTH[n.kind] / 2, y: pos.y - NODE_HEIGHT[n.kind] / 2 },
      data: { node: n, onJump },
      draggable: false,
    };
  });
  const edges: Edge[] = graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#525252', strokeWidth: 1, ...(e.dashed ? { strokeDasharray: '4 4' } : {}) },
  }));
  return { nodes, edges };
}

export function GraphFlow({ events }: { events: readonly JsonlEvent[] }) {
  const jumpToEvent = useUiStore((s) => s.jumpToEvent);

  const { nodes, edges } = useMemo(() => {
    const g = buildConversationGraph(events);
    return layout(g.nodes, g.edges, jumpToEvent);
  }, [events, jumpToEvent]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        Brak wiadomości do pokazania na grafie.
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-neutral-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        panOnScroll
        zoomOnPinch
      >
        <Background gap={24} color="#262626" />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
