// Static catalog rendered in the Imports tab of the bottom panel. v1 is read-
// only and hand-maintained — when the executor lands (Phase 7) and we have a
// real notion of installed packages this gets sourced from the backend.

export interface NodeImportPackage {
  id: string;
  name: string;
  author: string;
  description: string;
  categories: ReadonlyArray<{ name: string; items: readonly string[] }>;
}

export interface PythonPackage {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
}

export const NODE_IMPORTS: ReadonlyArray<NodeImportPackage> = [
  {
    id: "fundamentals",
    name: "Fundamentals",
    author: "node-forge",
    description:
      "Native package with the fundamental nodes for basic needs (math, logic, control flow, type conversion).",
    categories: [
      { name: "Math", items: ["Add", "Subtract", "Multiply"] },
      { name: "Logic", items: [] },
      { name: "Flow Control", items: [] },
      { name: "String", items: [] },
      { name: "List", items: [] },
      { name: "Type Conversion", items: [] },
      { name: "Other", items: [] },
    ],
  },
  {
    id: "quantum",
    name: "Quantum",
    author: "node-forge",
    description:
      "Qiskit-based quantum gates, measurement, and simulator nodes. Drag onto the canvas to build circuits.",
    categories: [
      {
        name: "1-qubit gates",
        items: ["Hadamard (H)", "Pauli-X", "Pauli-Y", "Pauli-Z"],
      },
      { name: "2-qubit gates", items: ["CNOT"] },
      { name: "Measurement & structure", items: ["Measure", "Barrier"] },
      {
        name: "Execution & visualization",
        items: ["Run (Aer Simulator)", "Plot Histogram"],
      },
    ],
  },
];

export const PYTHON_PACKAGES: ReadonlyArray<PythonPackage> = [
  {
    id: "qiskit",
    name: "qiskit",
    author: "IBM Quantum",
    description:
      "Open-source SDK for working with quantum computers at the level of pulses, circuits, and algorithms.",
    version: "1.x",
  },
  {
    id: "qiskit-aer",
    name: "qiskit-aer",
    author: "IBM Quantum",
    description: "High-performance simulator framework for Qiskit circuits.",
    version: "0.x",
  },
  {
    id: "numpy",
    name: "numpy",
    author: "NumPy Developers",
    description: "Fundamental package for array computing in Python.",
    version: "2.x",
  },
  {
    id: "matplotlib",
    name: "matplotlib",
    author: "Matplotlib Dev Team",
    description:
      "Plotting library used for histograms and circuit visualizations.",
    version: "3.x",
  },
];
