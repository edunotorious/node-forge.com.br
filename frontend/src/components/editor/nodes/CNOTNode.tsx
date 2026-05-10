"use client";

import type { NodeProps } from "@xyflow/react";

import { useEditor } from "@/stores/editor";
import type { CNOTData } from "@/lib/graph-types";

import { BaseNode } from "./BaseNode";

export function CNOTNode({ id, data, selected }: NodeProps) {
  const update = useEditor((s) => s.updateNodeData);
  const numQubits = useEditor((s) => s.config.num_qubits);
  const isolated = useEditor(
    (s) => !s.edges.some((e) => e.source === id || e.target === id),
  );
  const d = data as CNOTData;
  const ctrl = d.control_qubit ?? 0;
  const tgt = d.target_qubit ?? 1;

  let warning: string | undefined;
  if (ctrl >= numQubits || tgt >= numQubits) warning = `qubit ≥ ${numQubits}`;
  else if (ctrl === tgt) warning = "control = target";

  return (
    <BaseNode selected={selected} isolated={isolated} warning={warning}>
      <div className="font-mono text-base font-bold">CNOT</div>
      <div className="mt-1 grid grid-cols-[auto_1fr] items-center gap-x-1 gap-y-1 text-xs">
        <span className="text-muted-foreground">control</span>
        <input
          type="number"
          min={0}
          value={ctrl}
          onChange={(e) => update(id, { control_qubit: Number(e.target.value) })}
          className="h-6 w-12 rounded border bg-background px-1 nodrag"
        />
        <span className="text-muted-foreground">target</span>
        <input
          type="number"
          min={0}
          value={tgt}
          onChange={(e) => update(id, { target_qubit: Number(e.target.value) })}
          className="h-6 w-12 rounded border bg-background px-1 nodrag"
        />
      </div>
    </BaseNode>
  );
}
