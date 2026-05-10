"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback } from "react";

import { useEditor } from "@/stores/editor";

import { defaultDataFor, nodeTypes } from "./nodes";

const NODE_TYPE_DRAG_KEY = "application/x-nodeforge-node-type";

export function Canvas() {
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const onNodesChange = useEditor((s) => s.onNodesChange);
  const onEdgesChange = useEditor((s) => s.onEdgesChange);
  const onConnect = useEditor((s) => s.onConnect);
  const addNode = useEditor((s) => s.addNode);
  const setSelectedNode = useEditor((s) => s.setSelectedNode);

  const { screenToFlowPosition } = useReactFlow();

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

  return (
    <div className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
