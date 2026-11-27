import { describe, expect, it } from "vitest";

import { NODE_TYPES } from "@/lib/graph-types";

import { bellStateTemplate } from "./templates";

describe("bellStateTemplate", () => {
  it("wires H → CNOT → measures → run → plot as a single chain", () => {
    const { nodes, edges, config } = bellStateTemplate();
    expect(nodes.map((n) => n.type)).toEqual([
      NODE_TYPES.HADAMARD,
      NODE_TYPES.CNOT,
      NODE_TYPES.MEASURE,
      NODE_TYPES.MEASURE,
      NODE_TYPES.RUN_LOCAL_SIMULATOR,
      NODE_TYPES.PLOT_HISTOGRAM,
    ]);
    expect(edges).toHaveLength(nodes.length - 1);
    edges.forEach((e, i) => {
      expect(e.source).toBe(nodes[i].id);
      expect(e.target).toBe(nodes[i + 1].id);
    });
    expect(config).toEqual({ num_qubits: 2, num_classical: 2, shots: 1000 });
  });

  it("gives every node and edge a unique id", () => {
    const { nodes, edges } = bellStateTemplate();
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });
});
