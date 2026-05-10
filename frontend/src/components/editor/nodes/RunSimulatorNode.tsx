"use client";

import type { NodeProps } from "@xyflow/react";

import { useEditor } from "@/stores/editor";
import type { RunSimulatorData } from "@/lib/graph-types";

import { BaseNode } from "./BaseNode";

export function RunSimulatorNode({ id, data, selected }: NodeProps) {
  const update = useEditor((s) => s.updateNodeData);
  const isolated = useEditor(
    (s) => !s.edges.some((e) => e.source === id || e.target === id),
  );
  const shots = (data as RunSimulatorData).shots ?? 1000;

  return (
    <BaseNode selected={selected} isolated={isolated}>
      <div className="font-mono text-sm font-bold">Run (Aer)</div>
      <div className="mt-1 flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">shots</span>
        <input
          type="number"
          min={1}
          value={shots}
          onChange={(e) => update(id, { shots: Number(e.target.value) })}
          className="h-6 w-16 rounded border bg-background px-1 nodrag"
        />
      </div>
    </BaseNode>
  );
}
