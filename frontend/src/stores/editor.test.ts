import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "@/lib/graph-types";

import { useEditor } from "./editor";

const store = () => useEditor.getState();

function node(id: string, x = 0, y = 0): Node {
  return { id, type: "qiskit.hadamard", position: { x, y }, data: { qubit_index: 0 } };
}

function hydrateWith(nodes: Node[], edges: { id: string; source: string; target: string }[] = []) {
  store().hydrate({
    projectId: "p1",
    projectName: "Projeto",
    fileId: "f1",
    fileName: "Arquivo 1",
    files: [],
    nodes,
    edges,
    config: DEFAULT_CONFIG,
    variables: [],
    functions: [],
    classes: [],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  store().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("history basics", () => {
  it("hydrate starts clean: idle, no history", () => {
    hydrateWith([node("a")]);
    expect(store().saveStatus).toBe("idle");
    expect(store().past).toEqual([]);
  });

  it("undo/redo an added node", () => {
    hydrateWith([]);
    store().addNode(node("a"));
    expect(store().nodes.map((n) => n.id)).toEqual(["a"]);
    expect(store().saveStatus).toBe("dirty");

    store().undo();
    expect(store().nodes).toEqual([]);
    store().redo();
    expect(store().nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("selection changes do not dirty the file or touch history", () => {
    hydrateWith([node("a")]);
    store().onNodesChange([{ type: "select", id: "a", selected: true }]);
    expect(store().saveStatus).toBe("idle");
    expect(store().past).toEqual([]);
  });

  it("history is capped at 50 steps", () => {
    hydrateWith([]);
    for (let i = 0; i < 60; i++) store().addNode(node(`n${i}`));
    expect(store().past).toHaveLength(50);
  });

  it("switching file clears history and the last run", () => {
    hydrateWith([]);
    store().addNode(node("a"));
    store().setLastJob({ id: "j1", status: "succeeded" } as never);
    store().loadFile({
      fileId: "f2",
      fileName: "Arquivo 2",
      nodes: [],
      edges: [],
      config: DEFAULT_CONFIG,
      variables: [],
      functions: [],
      classes: [],
    });
    expect(store().past).toEqual([]);
    expect(store().saveStatus).toBe("idle");
    expect(store().lastJob).toBeNull();
  });
});

describe("dragging a node", () => {
  it("undo returns the node to where the drag started", () => {
    hydrateWith([node("a", 0, 0)]);
    store().onNodesChange([
      { type: "position", id: "a", position: { x: 10, y: 10 }, dragging: true },
    ]);
    store().onNodesChange([
      { type: "position", id: "a", position: { x: 50, y: 50 }, dragging: true },
    ]);
    store().onNodesChange([
      { type: "position", id: "a", position: { x: 80, y: 80 }, dragging: false },
    ]);
    expect(store().nodes[0].position).toEqual({ x: 80, y: 80 });
    expect(store().saveStatus).toBe("dirty");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});

describe("typing coalesces into one undo step", () => {
  it("project name typed quickly is one step", () => {
    hydrateWith([]);
    for (const name of ["P", "Pr", "Pro", "Proj"]) {
      store().setProjectName(name);
      vi.advanceTimersByTime(100);
    }
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().projectName).toBe("Projeto");
  });

  it("a pause starts a new step", () => {
    hydrateWith([]);
    store().setProjectName("A");
    vi.advanceTimersByTime(2000);
    store().setProjectName("AB");
    expect(store().past).toHaveLength(2);
    store().undo();
    expect(store().projectName).toBe("A");
  });

  it("edits to different nodes are separate steps", () => {
    hydrateWith([node("a"), node("b")]);
    store().updateNodeData("a", { qubit_index: 1 });
    store().updateNodeData("b", { qubit_index: 1 });
    expect(store().past).toHaveLength(2);
  });

  it("an undo in between breaks the group", () => {
    hydrateWith([]);
    store().setProjectName("X");
    store().undo();
    store().setProjectName("Y");
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().projectName).toBe("Projeto");
  });
});

describe("deleteNode", () => {
  it("removes the node and its edges in one undoable step", () => {
    hydrateWith(
      [node("a"), node("b"), node("c")],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
      ],
    );
    store().deleteNode("b");
    expect(store().nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(store().edges).toEqual([]);
    expect(store().saveStatus).toBe("dirty");

    store().undo();
    expect(store().nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(store().edges.map((e) => e.id)).toEqual(["ab", "bc"]);
  });

  it("clears the selection when the selected node is deleted", () => {
    hydrateWith([node("a")]);
    store().setSelectedNode("a");
    store().deleteNode("a");
    expect(store().selectedNodeId).toBeNull();
  });
});
