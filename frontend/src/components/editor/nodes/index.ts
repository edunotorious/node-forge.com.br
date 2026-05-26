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

// Group labels are translation keys under `editor.palette.groups`; item labels
// are technical names that stay in English across locales.
export const PALETTE_GROUPS: {
  labelKey: "singleQubit" | "twoQubits" | "measurement" | "execution";
  items: { type: string; label: string }[];
}[] = [
  {
    labelKey: "singleQubit",
    items: [
      { type: NODE_TYPES.HADAMARD, label: "Hadamard (H)" },
      { type: NODE_TYPES.PAULI_X, label: "Pauli-X" },
      { type: NODE_TYPES.PAULI_Y, label: "Pauli-Y" },
      { type: NODE_TYPES.PAULI_Z, label: "Pauli-Z" },
    ],
  },
  {
    labelKey: "twoQubits",
    items: [{ type: NODE_TYPES.CNOT, label: "CNOT" }],
  },
  {
    labelKey: "measurement",
    items: [
      { type: NODE_TYPES.MEASURE, label: "Measure" },
      { type: NODE_TYPES.BARRIER, label: "Barrier" },
    ],
  },
  {
    labelKey: "execution",
    items: [
      { type: NODE_TYPES.RUN_LOCAL_SIMULATOR, label: "Run (Aer Simulator)" },
      { type: NODE_TYPES.PLOT_HISTOGRAM, label: "Plot Histogram" },
    ],
  },
];
