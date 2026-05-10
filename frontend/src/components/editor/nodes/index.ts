import type { NodeTypes } from "@xyflow/react";

import { NODE_TYPES } from "@/lib/graph-types";

import { BarrierNode } from "./BarrierNode";
import { CNOTNode } from "./CNOTNode";
import { MeasureNode } from "./MeasureNode";
import { PlotHistogramNode } from "./PlotHistogramNode";
import { RunSimulatorNode } from "./RunSimulatorNode";
import { SingleQubitGateNode } from "./SingleQubitGateNode";

// Mapping consumed by React Flow's `nodeTypes` prop. Single-qubit gates share
// one component that reads its label from the node's `type` field.
export const nodeTypes: NodeTypes = {
  [NODE_TYPES.HADAMARD]: SingleQubitGateNode,
  [NODE_TYPES.PAULI_X]: SingleQubitGateNode,
  [NODE_TYPES.PAULI_Y]: SingleQubitGateNode,
  [NODE_TYPES.PAULI_Z]: SingleQubitGateNode,
  [NODE_TYPES.CNOT]: CNOTNode,
  [NODE_TYPES.MEASURE]: MeasureNode,
  [NODE_TYPES.BARRIER]: BarrierNode,
  [NODE_TYPES.RUN_LOCAL_SIMULATOR]: RunSimulatorNode,
  [NODE_TYPES.PLOT_HISTOGRAM]: PlotHistogramNode,
};

// Default `data` for newly created nodes of each type.
export function defaultDataFor(type: string): Record<string, unknown> {
  switch (type) {
    case NODE_TYPES.HADAMARD:
    case NODE_TYPES.PAULI_X:
    case NODE_TYPES.PAULI_Y:
    case NODE_TYPES.PAULI_Z:
      return { qubit_index: 0 };
    case NODE_TYPES.CNOT:
      return { control_qubit: 0, target_qubit: 1 };
    case NODE_TYPES.MEASURE:
      return { qubit_index: 0, classical_index: 0 };
    case NODE_TYPES.BARRIER:
      return {};
    case NODE_TYPES.RUN_LOCAL_SIMULATOR:
      return { shots: 1000 };
    case NODE_TYPES.PLOT_HISTOGRAM:
      return {};
    default:
      return {};
  }
}

export const PALETTE_GROUPS: { label: string; items: { type: string; label: string }[] }[] = [
  {
    label: "Gates de 1 qubit",
    items: [
      { type: NODE_TYPES.HADAMARD, label: "Hadamard (H)" },
      { type: NODE_TYPES.PAULI_X, label: "Pauli-X" },
      { type: NODE_TYPES.PAULI_Y, label: "Pauli-Y" },
      { type: NODE_TYPES.PAULI_Z, label: "Pauli-Z" },
    ],
  },
  {
    label: "Gates de 2 qubits",
    items: [{ type: NODE_TYPES.CNOT, label: "CNOT" }],
  },
  {
    label: "Medição e estrutura",
    items: [
      { type: NODE_TYPES.MEASURE, label: "Measure" },
      { type: NODE_TYPES.BARRIER, label: "Barrier" },
    ],
  },
  {
    label: "Execução e visualização",
    items: [
      { type: NODE_TYPES.RUN_LOCAL_SIMULATOR, label: "Run (Aer Simulator)" },
      { type: NODE_TYPES.PLOT_HISTOGRAM, label: "Plot Histogram" },
    ],
  },
];
