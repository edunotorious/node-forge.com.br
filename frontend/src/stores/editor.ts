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

import type { ProjectFileSummary } from "@/lib/server-api";
import {
  DEFAULT_CONFIG,
  type ClassDef,
  type ExecutionJob,
  type FunctionDef,
  type GraphConfig,
  type VariableDef,
} from "@/lib/graph-types";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
export type LeftTab = "details" | "classes" | "inspect";
export type BottomTab = "console" | "terminal" | "imports";

// Subset of state that participates in undo/redo. Project / file identity,
// UI toggles (tabs, collapse), and run results are deliberately OUT — we
// only undo user EDITS to the file's content.
interface Snapshot {
  projectName: string;
  nodes: Node[];
  edges: Edge[];
  config: GraphConfig;
  variables: VariableDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
}

// Bound the history to keep large editing sessions from chewing through
// memory. 50 steps is more than enough for typical user undo expectations.
const MAX_HISTORY = 50;

interface State {
  projectId: string | null;
  projectName: string;
  fileId: string | null;
  fileName: string;
  files: ProjectFileSummary[];
  nodes: Node[];
  edges: Edge[];
  config: GraphConfig;
  variables: VariableDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
  selectedNodeId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  leftTab: LeftTab;
  bottomTab: BottomTab;
  bottomPanelCollapsed: boolean;
  lastJob: ExecutionJob | null;
  isRunning: boolean;
  // Undo / redo stacks. past[past.length - 1] is the most recent snapshot
  // to roll back to; future[0] is the next thing to redo.
  past: Snapshot[];
  future: Snapshot[];
}

interface Actions {
  hydrate: (data: {
    projectId: string;
    projectName: string;
    fileId: string;
    fileName: string;
    files: ProjectFileSummary[];
    nodes: Node[];
    edges: Edge[];
    config: GraphConfig;
    variables: VariableDef[];
    functions: FunctionDef[];
    classes: ClassDef[];
  }) => void;
  // Replace just the active-file graph + identity, keeping project info. Used
  // when switching tabs without re-hydrating from a server roundtrip.
  loadFile: (data: {
    fileId: string;
    fileName: string;
    nodes: Node[];
    edges: Edge[];
    config: GraphConfig;
    variables: VariableDef[];
    functions: FunctionDef[];
    classes: ClassDef[];
  }) => void;
  setFiles: (files: ProjectFileSummary[]) => void;
  reset: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  addNode: (node: Node) => void;
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  setSelectedNode: (id: string | null) => void;
  setConfig: (patch: Partial<GraphConfig>) => void;
  setProjectName: (name: string) => void;
  addVariable: (v: VariableDef) => void;
  updateVariable: (id: string, patch: Partial<VariableDef>) => void;
  removeVariable: (id: string) => void;
  addFunction: (f: FunctionDef) => void;
  updateFunction: (id: string, patch: Partial<FunctionDef>) => void;
  removeFunction: (id: string) => void;
  addClass: (c: ClassDef) => void;
  removeClass: (id: string) => void;
  updateClass: (id: string, patch: Partial<ClassDef>) => void;
  markDirty: () => void;
  setSaveStatus: (status: SaveStatus, when?: Date | null) => void;
  setLeftTab: (tab: LeftTab) => void;
  setBottomTab: (tab: BottomTab) => void;
  toggleBottomPanel: () => void;
  setLastJob: (job: ExecutionJob | null) => void;
  setIsRunning: (running: boolean) => void;
  // History controls. canUndo / canRedo are derived selectors so the
  // EditorTopBar can disable its buttons accordingly.
  undo: () => void;
  redo: () => void;
}

const INITIAL: State = {
  projectId: null,
  projectName: "",
  fileId: null,
  fileName: "",
  files: [],
  nodes: [],
  edges: [],
  config: DEFAULT_CONFIG,
  variables: [],
  functions: [],
  classes: [],
  selectedNodeId: null,
  saveStatus: "idle",
  lastSavedAt: null,
  leftTab: "details",
  bottomTab: "console",
  bottomPanelCollapsed: false,
  lastJob: null,
  isRunning: false,
  past: [],
  future: [],
};

function captureSnapshot(s: State): Snapshot {
  return {
    projectName: s.projectName,
    nodes: s.nodes,
    edges: s.edges,
    config: s.config,
    variables: s.variables,
    functions: s.functions,
    classes: s.classes,
  };
}

// Patch returned by every mutating action to snapshot the current state
// onto `past` and invalidate `future`. The cap-via-slice keeps the
// history bounded.
function _pushHistory(s: State): Pick<State, "past" | "future"> {
  return {
    past: [...s.past, captureSnapshot(s)].slice(-MAX_HISTORY),
    future: [],
  };
}

// User-driven changes flip status to "dirty" so the auto-save effect can tell
// real edits apart from the initial hydrate. Hydrate resets to "idle" AND
// clears history — undoing back into a different file's state would be a
// confusing footgun.
export const useEditor = create<State & Actions>((set) => ({
  ...INITIAL,
  hydrate: (data) =>
    set({
      projectId: data.projectId,
      projectName: data.projectName,
      fileId: data.fileId,
      fileName: data.fileName,
      files: data.files,
      nodes: data.nodes,
      edges: data.edges,
      config: data.config,
      variables: data.variables,
      functions: data.functions,
      classes: data.classes,
      selectedNodeId: null,
      saveStatus: "idle",
      lastSavedAt: null,
      past: [],
      future: [],
    }),
  loadFile: (data) =>
    set({
      fileId: data.fileId,
      fileName: data.fileName,
      nodes: data.nodes,
      edges: data.edges,
      config: data.config,
      variables: data.variables,
      functions: data.functions,
      classes: data.classes,
      selectedNodeId: null,
      saveStatus: "idle",
      lastSavedAt: null,
      past: [],
      future: [],
    }),
  setFiles: (files) => set({ files }),
  reset: () => set(INITIAL),
  onNodesChange: (changes) =>
    set((s) => {
      const meaningful = hasMeaningfulChange(changes);
      return {
        ...(meaningful ? _pushHistory(s) : {}),
        nodes: applyNodeChanges(changes, s.nodes),
        saveStatus: meaningful ? "dirty" : s.saveStatus,
      };
    }),
  onEdgesChange: (changes) =>
    set((s) => {
      const meaningful = hasMeaningfulChange(changes);
      return {
        ...(meaningful ? _pushHistory(s) : {}),
        edges: applyEdgeChanges(changes, s.edges),
        saveStatus: meaningful ? "dirty" : s.saveStatus,
      };
    }),
  onConnect: (conn) =>
    set((s) => ({
      ..._pushHistory(s),
      edges: addEdge(conn, s.edges),
      saveStatus: "dirty",
    })),
  addNode: (node) =>
    set((s) => ({
      ..._pushHistory(s),
      nodes: [...s.nodes, node],
      saveStatus: "dirty",
    })),
  updateNodeData: (id, patch) =>
    set((s) => ({
      ..._pushHistory(s),
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
      saveStatus: "dirty",
    })),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setConfig: (patch) =>
    set((s) => ({
      ..._pushHistory(s),
      config: { ...s.config, ...patch },
      saveStatus: "dirty",
    })),
  setProjectName: (name) =>
    set((s) => ({
      ..._pushHistory(s),
      projectName: name,
      saveStatus: "dirty",
    })),
  addVariable: (v) =>
    set((s) => ({
      ..._pushHistory(s),
      variables: [...s.variables, v],
      saveStatus: "dirty",
    })),
  updateVariable: (id, patch) =>
    set((s) => ({
      ..._pushHistory(s),
      variables: s.variables.map((v) =>
        v.id === id ? { ...v, ...patch } : v,
      ),
      saveStatus: "dirty",
    })),
  removeVariable: (id) =>
    set((s) => ({
      ..._pushHistory(s),
      variables: s.variables.filter((v) => v.id !== id),
      saveStatus: "dirty",
    })),
  addFunction: (f) =>
    set((s) => ({
      ..._pushHistory(s),
      functions: [...s.functions, f],
      saveStatus: "dirty",
    })),
  updateFunction: (id, patch) =>
    set((s) => ({
      ..._pushHistory(s),
      functions: s.functions.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
      saveStatus: "dirty",
    })),
  removeFunction: (id) =>
    set((s) => ({
      ..._pushHistory(s),
      functions: s.functions.filter((f) => f.id !== id),
      saveStatus: "dirty",
    })),
  addClass: (c) =>
    set((s) => ({
      ..._pushHistory(s),
      classes: [...s.classes, c],
      saveStatus: "dirty",
    })),
  removeClass: (id) =>
    set((s) => ({
      ..._pushHistory(s),
      classes: s.classes.filter((c) => c.id !== id),
      saveStatus: "dirty",
    })),
  updateClass: (id, patch) =>
    set((s) => ({
      ..._pushHistory(s),
      classes: s.classes.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
      saveStatus: "dirty",
    })),
  markDirty: () => set({ saveStatus: "dirty" }),
  setSaveStatus: (status, when) =>
    set((s) => ({
      saveStatus: status,
      lastSavedAt: when === undefined ? s.lastSavedAt : when,
    })),
  setLeftTab: (tab) => set({ leftTab: tab }),
  setBottomTab: (tab) => set({ bottomTab: tab, bottomPanelCollapsed: false }),
  toggleBottomPanel: () =>
    set((s) => ({ bottomPanelCollapsed: !s.bottomPanelCollapsed })),
  setLastJob: (job) => set({ lastJob: job }),
  setIsRunning: (running) => set({ isRunning: running }),
  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        ...prev,
        past: s.past.slice(0, -1),
        future: [captureSnapshot(s), ...s.future].slice(0, MAX_HISTORY),
        // Clear node selection — the selected node might not exist anymore
        // after the rollback (e.g. it was an add that got undone).
        selectedNodeId: null,
        saveStatus: "dirty",
      };
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        ...next,
        past: [...s.past, captureSnapshot(s)].slice(-MAX_HISTORY),
        future: s.future.slice(1),
        selectedNodeId: null,
        saveStatus: "dirty",
      };
    }),
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
