"use client";

import type { NodeProps } from "@xyflow/react";

import { useEditor } from "@/stores/editor";
import type { MeasureData } from "@/lib/graph-types";

import { BaseNode } from "./BaseNode";

export function MeasureNode({ id, data, selected }: NodeProps) {
  const update = useEditor((s) => s.updateNodeData);
  const numQubits = useEditor((s) => s.config.num_qubits);
  const numClassical = useEditor((s) => s.config.num_classical);
  const isolated = useEditor(
    (s) => !s.edges.some((e) => e.source === id || e.target === id),
  );
  const d = data as MeasureData;
  const q = d.qubit_index ?? 0;
  const c = d.classical_index ?? 0;

  let warning: string | undefined;
  if (q >= numQubits) warning = `qubit ≥ ${numQubits}`;
  else if (c >= numClassical) warning = `cbit ≥ ${numClassical}`;

  return (
    <BaseNode selected={selected} isolated={isolated} warning={warning}>
      <div className="font-mono text-base font-bold">Measure</div>
      <div className="mt-1 grid grid-cols-[auto_1fr] items-center gap-x-1 gap-y-1 text-xs">
        <span className="text-muted-foreground">qubit</span>
        <input
          type="number"
          min={0}
          value={q}
          onChange={(e) => update(id, { qubit_index: Number(e.target.value) })}
          className="h-6 w-12 rounded border bg-background px-1 nodrag"
        />
        <span className="text-muted-foreground">cbit</span>
        <input
          type="number"
          min={0}
          value={c}
          onChange={(e) =>
            update(id, { classical_index: Number(e.target.value) })
          }
          className="h-6 w-12 rounded border bg-background px-1 nodrag"
        />
      </div>
    </BaseNode>
  );
}
