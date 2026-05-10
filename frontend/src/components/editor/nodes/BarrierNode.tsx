"use client";

import type { NodeProps } from "@xyflow/react";

import { useEditor } from "@/stores/editor";

import { BaseNode } from "./BaseNode";

export function BarrierNode({ id, selected }: NodeProps) {
  const isolated = useEditor(
    (s) => !s.edges.some((e) => e.source === id || e.target === id),
  );
  return (
    <BaseNode selected={selected} isolated={isolated}>
      <div className="font-mono text-base font-bold">Barrier</div>
      <div className="text-xs text-muted-foreground">all qubits</div>
    </BaseNode>
  );
}
