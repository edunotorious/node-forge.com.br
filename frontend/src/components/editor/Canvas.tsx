"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Node as FlowNode,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface NodeMenuState {
  screenX: number;
  screenY: number;
  nodeId: string;
}

export function Canvas() {
  const t = useTranslations("editor.nodeMenu");
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const onNodesChange = useEditor((s) => s.onNodesChange);
  const onEdgesChange = useEditor((s) => s.onEdgesChange);
  const onConnect = useEditor((s) => s.onConnect);
  const addNode = useEditor((s) => s.addNode);
  const setSelectedNode = useEditor((s) => s.setSelectedNode);

  const { screenToFlowPosition } = useReactFlow();
  const [search, setSearch] = useState<SearchState | null>(null);
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null);
  const nodeMenuRef = useRef<HTMLDivElement>(null);

  // Dismiss the node menu on any outside pointerdown / Escape, mirroring
  // the SearchNodePopup pattern (capture phase so React Flow doesn't
  // swallow the event).
  useEffect(() => {
    if (!nodeMenu) return;
    function onDown(e: PointerEvent) {
      if (
        nodeMenuRef.current &&
        !nodeMenuRef.current.contains(e.target as Node)
      ) {
        setNodeMenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNodeMenu(null);
    }
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [nodeMenu]);

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

  // Right-click on a node = open the node delete menu. Clicks on the
  // pane fall through to onPaneContextMenu above; React Flow dispatches
  // to one or the other based on the click target.
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FlowNode) => {
      event.preventDefault();
      setNodeMenu({
        screenX: event.clientX,
        screenY: event.clientY,
        nodeId: node.id,
      });
    },
    [],
  );

  function deleteNode(id: string) {
    // applyNodeChanges in the store handles the "remove" change type and
    // flips saveStatus to dirty so the autosave persists the deletion.
    onNodesChange([{ type: "remove", id }]);
    setNodeMenu(null);
  }

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
        onNodeContextMenu={onNodeContextMenu}
        // Both Delete and Backspace nuke the selected node so the muscle
        // memory works on every keyboard layout.
        deleteKeyCode={["Delete", "Backspace"]}
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
      {nodeMenu && (
        <div
          ref={nodeMenuRef}
          // Clamp the popup so it never spills off the right/bottom edge
          // of the viewport — same trick the SearchNodePopup uses.
          style={{
            position: "fixed",
            left: Math.min(nodeMenu.screenX, window.innerWidth - 180),
            top: Math.min(nodeMenu.screenY, window.innerHeight - 72),
          }}
          className="z-50 min-w-[160px] overflow-hidden rounded-md bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/15"
        >
          <button
            type="button"
            onClick={() => deleteNode(nodeMenu.nodeId)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            {t("delete")}
          </button>
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            {t("deleteHint")}
          </div>
        </div>
      )}
    </div>
  );
}
