"use client";

import type { NodeProps } from "@xyflow/react";

import { useEditor } from "@/stores/editor";
import type { SingleQubitData } from "@/lib/graph-types";

import { BaseNode } from "./BaseNode";

const LABELS: Record<string, string> = {
  "qiskit.hadamard": "H",
  "qiskit.pauli_x": "X",
  "qiskit.pauli_y": "Y",
  "qiskit.pauli_z": "Z",
};

export function SingleQubitGateNode({ id, type, data, selected }: NodeProps) {
  const update = useEditor((s) => s.updateNodeData);
  const numQubits = useEditor((s) => s.config.num_qubits);
  const isolated = useEditor(
    (s) => !s.edges.some((e) => e.source === id || e.target === id),
  );
  const d = data as SingleQubitData;
  const qubit = d.qubit_index ?? 0;
  const warning = qubit >= numQubits ? `qubit ≥ ${numQubits}` : undefined;
  const label = LABELS[type ?? ""] ?? "?";

  return (
    <BaseNode selected={selected} isolated={isolated} warning={warning}>
      <div className="font-mono text-base font-bold">{label}</div>
      <div className="mt-1 flex items-center gap-1">
        <span className="text-xs text-muted-foreground">qubit</span>
        <input
          type="number"
          min={0}
          value={qubit}
          onChange={(e) => update(id, { qubit_index: Number(e.target.value) })}
          className="h-6 w-12 rounded border bg-background px-1 text-xs nodrag"
        />
      </div>
    </BaseNode>
  );
}
