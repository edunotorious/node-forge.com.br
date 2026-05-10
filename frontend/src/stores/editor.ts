import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";

import { DEFAULT_CONFIG, type GraphConfig } from "@/lib/graph-types";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface State {
  projectId: string | null;
  projectName: string;
  nodes: Node[];
  edges: Edge[];
  config: GraphConfig;
  selectedNodeId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
}

interface Actions {
  hydrate: (data: {
    projectId: string;
    projectName: string;
    nodes: Node[];
    edges: Edge[];
    config: GraphConfig;
  }) => void;
  reset: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  addNode: (node: Node) => void;
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  setSelectedNode: (id: string | null) => void;
  setConfig: (patch: Partial<GraphConfig>) => void;
  setProjectName: (name: string) => void;
  markDirty: () => void;
  setSaveStatus: (status: SaveStatus, when?: Date | null) => void;
}

const INITIAL: State = {
  projectId: null,
  projectName: "",
  nodes: [],
  edges: [],
  config: DEFAULT_CONFIG,
  selectedNodeId: null,
  saveStatus: "idle",
  lastSavedAt: null,
};

// User-driven changes flip status to "dirty" so the auto-save effect can tell
// real edits apart from the initial hydrate. Hydrate resets to "idle".
export const useEditor = create<State & Actions>((set) => ({
  ...INITIAL,
  hydrate: (data) =>
    set({
      projectId: data.projectId,
      projectName: data.projectName,
      nodes: data.nodes,
      edges: data.edges,
      config: data.config,
      selectedNodeId: null,
      saveStatus: "idle",
      lastSavedAt: null,
    }),
  reset: () => set(INITIAL),
  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      saveStatus: hasMeaningfulChange(changes) ? "dirty" : s.saveStatus,
    })),
  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      saveStatus: hasMeaningfulChange(changes) ? "dirty" : s.saveStatus,
    })),
  onConnect: (conn) =>
    set((s) => ({ edges: addEdge(conn, s.edges), saveStatus: "dirty" })),
  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node], saveStatus: "dirty" })),
  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
      saveStatus: "dirty",
    })),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setConfig: (patch) =>
    set((s) => ({ config: { ...s.config, ...patch }, saveStatus: "dirty" })),
  setProjectName: (name) => set({ projectName: name, saveStatus: "dirty" }),
  markDirty: () => set({ saveStatus: "dirty" }),
  setSaveStatus: (status, when) =>
    set((s) => ({
      saveStatus: status,
      lastSavedAt: when === undefined ? s.lastSavedAt : when,
    })),
}));

// React Flow emits selection/dimension/position-during-drag changes as part
// of normal interaction. Those should not flip the save status — only edits
// that change persisted shape (add, remove, position commit, data) do.
function hasMeaningfulChange(
  changes: NodeChange[] | EdgeChange[],
): boolean {
  return changes.some((c) => {
    if (c.type === "add" || c.type === "remove" || c.type === "replace") return true;
    if (c.type === "position" && (c as { dragging?: boolean }).dragging === false) {
      return true;
    }
    return false;
  });
}
