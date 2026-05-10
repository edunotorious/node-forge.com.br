"use client";

import { ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { DEFAULT_CONFIG, type GraphConfig } from "@/lib/graph-types";
import { useEditor } from "@/stores/editor";

import { Canvas } from "./Canvas";
import { EditorTopBar } from "./EditorTopBar";
import { NodePalette } from "./NodePalette";
import { PropertiesPanel } from "./PropertiesPanel";

interface EditorProps {
  initial: {
    id: string;
    name: string;
    graph: {
      nodes: unknown[];
      edges: unknown[];
      config: Partial<GraphConfig>;
    };
  };
}

const AUTOSAVE_DEBOUNCE_MS = 1000;

export function Editor({ initial }: EditorProps) {
  const hydrate = useEditor((s) => s.hydrate);
  const reset = useEditor((s) => s.reset);
  const setSaveStatus = useEditor((s) => s.setSaveStatus);

  // Hydrate the store from the server-rendered project, then reset on unmount
  // so leftover state cannot leak into the next project the user opens.
  useEffect(() => {
    hydrate({
      projectId: initial.id,
      projectName: initial.name,
      nodes: (initial.graph.nodes ?? []) as Node[],
      edges: (initial.graph.edges ?? []) as Edge[],
      config: { ...DEFAULT_CONFIG, ...(initial.graph.config ?? {}) },
    });
    return () => {
      reset();
    };
  }, [initial, hydrate, reset]);

  const save = useCallback(async () => {
    const state = useEditor.getState();
    if (!state.projectId) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/projects/${state.projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.projectName,
          graph_json: {
            nodes: state.nodes,
            edges: state.edges,
            config: state.config,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveStatus("saved", new Date());
    } catch (err) {
      console.error("autosave failed", err);
      setSaveStatus("error");
      toast.error("Falha ao salvar projeto");
    }
  }, [setSaveStatus]);

  // Debounced auto-save: when status flips to "dirty", wait
  // AUTOSAVE_DEBOUNCE_MS of quiet then PATCH.
  const saveStatus = useEditor((s) => s.saveStatus);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveStatus !== "dirty") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [saveStatus, save]);

  return (
    <ReactFlowProvider>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <EditorTopBar onSaveNow={() => void save()} />
        <div className="flex flex-1 overflow-hidden">
          <NodePalette />
          <Canvas />
          <PropertiesPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
