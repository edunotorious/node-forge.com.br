import type { Edge, Node } from "@xyflow/react";

export const NODE_TYPES = {
  HADAMARD: "qiskit.hadamard",
  PAULI_X: "qiskit.pauli_x",
  PAULI_Y: "qiskit.pauli_y",
  PAULI_Z: "qiskit.pauli_z",
  CNOT: "qiskit.cnot",
  MEASURE: "qiskit.measure",
  BARRIER: "qiskit.barrier",
  RUN_LOCAL_SIMULATOR: "qiskit.run_local_simulator",
  PLOT_HISTOGRAM: "qiskit.plot_histogram",
} as const;

export type NodeTypeId = (typeof NODE_TYPES)[keyof typeof NODE_TYPES];

export interface SingleQubitData extends Record<string, unknown> {
  qubit_index: number;
}

export interface CNOTData extends Record<string, unknown> {
  control_qubit: number;
  target_qubit: number;
}

export interface MeasureData extends Record<string, unknown> {
  qubit_index: number;
  classical_index: number;
}

export type BarrierData = Record<string, never>;

export interface RunSimulatorData extends Record<string, unknown> {
  shots: number;
}

export type PlotHistogramData = Record<string, never>;

export interface GraphConfig {
  num_qubits: number;
  num_classical: number;
  shots: number;
}

export interface GraphPayload {
  nodes: Node[];
  edges: Edge[];
  config: GraphConfig;
}

export const DEFAULT_CONFIG: GraphConfig = {
  num_qubits: 2,
  num_classical: 2,
  shots: 1000,
};
