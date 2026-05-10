"use client";

import type { NodeProps } from "@xyflow/react";

import { useEditor } from "@/stores/editor";

import { BaseNode } from "./BaseNode";

export function PlotHistogramNode({ id, selected }: NodeProps) {
  const isolated = useEditor(
    (s) => !s.edges.some((e) => e.source === id || e.target === id),
  );
  return (
    <BaseNode selected={selected} isolated={isolated} showOutput={false}>
      <div className="font-mono text-sm font-bold">Plot Histogram</div>
      <div className="text-xs text-muted-foreground">terminal</div>
    </BaseNode>
  );
}
