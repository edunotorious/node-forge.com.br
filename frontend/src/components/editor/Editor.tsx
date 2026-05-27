"use client";

import { ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { BottomPanel } from "@/components/editor/BottomPanel";
import { Canvas } from "@/components/editor/Canvas";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { FileTabsBar } from "@/components/editor/FileTabsBar";
import { LeftPanel } from "@/components/editor/LeftPanel";
import {
  DEFAULT_CONFIG,
  type ClassDef,
  type ExecutionJob,
  type FunctionDef,
  type GraphConfig,
  type VariableDef,
} from "@/lib/graph-types";
import type { ProjectFileSummary } from "@/lib/server-api";
import { useEditor } from "@/stores/editor";

interface EditorProps {
  initial: {
    projectId: string;
    projectName: string;
    fileId: string;
    fileName: string;
    files: ProjectFileSummary[];
    graph: {
      nodes: unknown[];
      edges: unknown[];
      config: Partial<GraphConfig>;
      variables: VariableDef[];
      functions: FunctionDef[];
      classes: ClassDef[];
    };
  };
}

const AUTOSAVE_DEBOUNCE_MS = 1000;

export function Editor({ initial }: EditorProps) {
  const t = useTranslations("editor");
  const hydrate = useEditor((s) => s.hydrate);
  const reset = useEditor((s) => s.reset);
  const setSaveStatus = useEditor((s) => s.setSaveStatus);

  // Hydrate the store from the server-rendered project, then reset on unmount
  // so leftover state cannot leak into the next project the user opens.
  useEffect(() => {
    hydrate({
      projectId: initial.projectId,
      projectName: initial.projectName,
      fileId: initial.fileId,
      fileName: initial.fileName,
      files: initial.files,
      nodes: (initial.graph.nodes ?? []) as Node[],
      edges: (initial.graph.edges ?? []) as Edge[],
      config: { ...DEFAULT_CONFIG, ...(initial.graph.config ?? {}) },
      variables: initial.graph.variables,
      functions: initial.graph.functions,
      classes: initial.graph.classes,
    });
    return () => {
      reset();
    };
  }, [initial, hydrate, reset]);

  const save = useCallback(async () => {
    const state = useEditor.getState();
    if (!state.projectId || !state.fileId) return;
    setSaveStatus("saving");
    try {
      // Project name lives on `projects`; the graph lives on the active
      // `project_files` row. Fire both in parallel — they target different
      // endpoints and there is no ordering requirement.
      const [projRes, fileRes] = await Promise.all([
        fetch(`/api/projects/${state.projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.projectName }),
        }),
        fetch(
          `/api/projects/${state.projectId}/files/${state.fileId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              graph_json: {
                nodes: state.nodes,
                edges: state.edges,
                config: state.config,
                variables: state.variables,
                functions: state.functions,
                classes: state.classes,
              },
            }),
          },
        ),
      ]);
      if (!projRes.ok) throw new Error(`project PATCH HTTP ${projRes.status}`);
      if (!fileRes.ok) throw new Error(`file PATCH HTTP ${fileRes.status}`);
      setSaveStatus("saved", new Date());
    } catch (err) {
      console.error("autosave failed", err);
      setSaveStatus("error");
      toast.error(t("autosaveFailed"));
    }
  }, [setSaveStatus, t]);

  // Force-save before file switch / explicit Save click — skips the debounce
  // if a save is not already pending.
  const flushSave = useCallback(async () => {
    const status = useEditor.getState().saveStatus;
    if (status === "dirty") await save();
  }, [save]);

  const setLastJob = useEditor((s) => s.setLastJob);
  const setIsRunning = useEditor((s) => s.setIsRunning);
  const setBottomTab = useEditor((s) => s.setBottomTab);

  // Execute the active file:
  //  1. Persist pending edits (flushSave).
  //  2. POST /run — backend returns 202 + the queued job synchronously and
  //     drives the executor in a background task.
  //  3. Poll GET /jobs/{id} until status is terminal, updating `lastJob`
  //     each tick so ConsoleView re-renders progressively.
  //
  // Polling caps at MAX_POLL_MS of wall time as a defence against a stuck
  // job — the executor's own timeout normally lands well before this.
  const runFile = useCallback(async () => {
    const state = useEditor.getState();
    if (!state.projectId || !state.fileId || state.isRunning) return;
    setIsRunning(true);
    setBottomTab("console");
    try {
      await flushSave();
      const res = await fetch(
        `/api/projects/${state.projectId}/files/${state.fileId}/run`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      let job: ExecutionJob = await res.json();
      setLastJob(job);

      const startedAt = Date.now();
      const MAX_POLL_MS = 90_000;
      const POLL_INTERVAL_MS = 500;
      while (
        (job.status === "queued" || job.status === "running") &&
        Date.now() - startedAt < MAX_POLL_MS
      ) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const pollRes = await fetch(`/api/jobs/${job.id}`);
        if (!pollRes.ok) {
          throw new Error(`poll HTTP ${pollRes.status}`);
        }
        job = await pollRes.json();
        setLastJob(job);
      }
    } catch (err) {
      toast.error(t("run.failed"));
      console.error("run failed", err);
    } finally {
      setIsRunning(false);
    }
  }, [flushSave, setIsRunning, setLastJob, setBottomTab, t]);

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
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <EditorTopBar onSaveNow={() => void save()} />
        <FileTabsBar flushSave={flushSave} onRun={() => void runFile()} />
        <div className="flex flex-1 overflow-hidden">
          <LeftPanel />
          <Canvas />
        </div>
        <BottomPanel />
      </div>
    </ReactFlowProvider>
  );
}
