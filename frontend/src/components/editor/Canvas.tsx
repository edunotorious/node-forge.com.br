"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useState } from "react";

import { SearchNodePopup } from "@/components/editor/SearchNodePopup";
import { useEditor } from "@/stores/editor";

import { defaultDataFor, nodeTypes } from "./nodes";

const NODE_TYPE_DRAG_KEY = "application/x-nodeforge-node-type";

interface SearchState {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
}

export function Canvas() {
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const onNodesChange = useEditor((s) => s.onNodesChange);
  const onEdgesChange = useEditor((s) => s.onEdgesChange);
  const onConnect = useEditor((s) => s.onConnect);
  const addNode = useEditor((s) => s.addNode);
  const setSelectedNode = useEditor((s) => s.setSelectedNode);

  const { screenToFlowPosition } = useReactFlow();
  const [search, setSearch] = useState<SearchState | null>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(NODE_TYPE_DRAG_KEY);
      if (!type) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const id = `${type.split(".").pop()}-${Date.now().toString(36)}`;
      addNode({
        id,
        type,
        position,
        data: defaultDataFor(type),
      });
    },
    [addNode, screenToFlowPosition],
  );

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const id = params.nodes[0]?.id ?? null;
      setSelectedNode(id);
    },
    [setSelectedNode],
  );

  // Right-click on the empty pane = open the Search Node popup at the
  // cursor. React Flow gives us a MouseEvent here; we capture both the
  // screen position (for the popup placement) and the flow position
  // (where the new node will land if the user picks one).
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const flow = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setSearch({
        screenX: event.clientX,
        screenY: event.clientY,
        flowX: flow.x,
        flowY: flow.y,
      });
    },
    [screenToFlowPosition],
  );

  const onPick = useCallback(
    (type: string) => {
      if (!search) return;
      const id = `${type.split(".").pop()}-${Date.now().toString(36)}`;
      addNode({
        id,
        type,
        position: { x: search.flowX, y: search.flowY },
        data: defaultDataFor(type),
      });
      setSearch(null);
    },
    [addNode, search],
  );

  return (
    <div className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {search && (
        <SearchNodePopup
          screenX={search.screenX}
          screenY={search.screenY}
          onPick={onPick}
          onClose={() => setSearch(null)}
        />
      )}
    </div>
  );
}
