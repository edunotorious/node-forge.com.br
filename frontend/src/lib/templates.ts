import type { Edge, Node } from "@xyflow/react";

import { NODE_TYPES, type GraphConfig } from "@/lib/graph-types";

// Starter circuit offered on an empty canvas: the Bell state (Φ⁺), the
// "hello world" of quantum computing. H puts q0 in superposition, CNOT
// entangles q1 with it, so the histogram only ever shows 00 and 11.
export function bellStateTemplate(): {
  nodes: Node[];
  edges: Edge[];
  config: GraphConfig;
} {
  // Unique ids per load, so loading the example twice (after an undo, or
  // into another file) never collides with ids already on the canvas.
  const stamp = Date.now().toString(36);
  const id = (name: string) => `${name}-${stamp}`;
  const step = 220;
  const chain: { name: string; type: string; data: Record<string, unknown> }[] = [
    { name: "hadamard", type: NODE_TYPES.HADAMARD, data: { qubit_index: 0 } },
    { name: "cnot", type: NODE_TYPES.CNOT, data: { control_qubit: 0, target_qubit: 1 } },
    { name: "measure0", type: NODE_TYPES.MEASURE, data: { qubit_index: 0, classical_index: 0 } },
    { name: "measure1", type: NODE_TYPES.MEASURE, data: { qubit_index: 1, classical_index: 1 } },
    { name: "run", type: NODE_TYPES.RUN_LOCAL_SIMULATOR, data: { shots: 1000 } },
    { name: "plot", type: NODE_TYPES.PLOT_HISTOGRAM, data: {} },
  ];
  const nodes: Node[] = chain.map((n, i) => ({
    id: id(n.name),
    type: n.type,
    position: { x: i * step, y: i % 2 === 0 ? 0 : 60 },
    data: n.data,
  }));
  const edges: Edge[] = chain.slice(1).map((n, i) => ({
    id: id(`e${i}`),
    source: id(chain[i].name),
    target: id(n.name),
  }));
  return {
    nodes,
    edges,
    config: { num_qubits: 2, num_classical: 2, shots: 1000 },
  };
}
