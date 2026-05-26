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

// Python-ish type system for user-defined variables and function I/O. v1
// supports a small primitive subset — extend the union (and TYPE_COLORS /
// TYPE_LABELS below) when classes / containers / numpy types come online.
export const VARIABLE_TYPES = ["Int", "Float", "Str", "Bool", "List", "Dict"] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];
export type ReturnType = VariableType | "None";

// Type → Tailwind bg class for the colored dot prefix in the Details panel.
// Hues roughly match the legend in the Figma's Classes-Inspect mockup.
export const TYPE_COLORS: Record<VariableType, string> = {
  Int: "bg-sky-500",
  Float: "bg-cyan-400",
  Str: "bg-orange-500",
  Bool: "bg-red-500",
  List: "bg-purple-500",
  Dict: "bg-yellow-500",
};

export type Visibility = "public" | "protected" | "private" | "constant";

// Python convention: `_name` → protected, `__name` → private, `ALL_CAPS` →
// constant, anything else → public. No runtime semantics yet — we infer it
// purely for the visibility glyph next to each variable.
export function detectVisibility(name: string): Visibility {
  if (!name) return "public";
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return "constant";
  if (name.startsWith("__")) return "private";
  if (name.startsWith("_")) return "protected";
  return "public";
}

export interface VariableDef {
  id: string;
  name: string;
  type: VariableType;
  value: string;
}

export interface FunctionParameter {
  name: string;
  type: VariableType;
}

export interface FunctionDef {
  id: string;
  name: string;
  return_type: ReturnType;
  parameters: FunctionParameter[];
  body: string;
}

export interface GraphPayload {
  nodes: Node[];
  edges: Edge[];
  config: GraphConfig;
  variables?: VariableDef[];
  functions?: FunctionDef[];
}

export const DEFAULT_CONFIG: GraphConfig = {
  num_qubits: 2,
  num_classical: 2,
  shots: 1000,
};

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timeout"
  | "error";

export interface JobArtifact {
  kind: string;
  filename: string;
  data_b64: string;
}

export interface ExecutionJob {
  id: string;
  status: JobStatus;
  stdout: string;
  stderr: string;
  artifacts_json: JobArtifact[];
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
