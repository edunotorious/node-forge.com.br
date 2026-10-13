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

type EditorState = ReturnType<typeof useEditor.getState>;

// PATCH the project name and the active file's graph. Takes the state as an
// argument and never touches the store, so it can also run after the editor
// unmounts (the store is reset by then). `keepalive` lets the request
// outlive a closing tab; browsers cap such bodies at 64 KB.
function persist(state: EditorState, keepalive = false): Promise<Response[]> {
  // Project name lives on `projects`; the graph lives on the active
  // `project_files` row. Fire both in parallel — they target different
  // endpoints and there is no ordering requirement.
  return Promise.all([
    fetch(`/api/projects/${state.projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: state.projectName }),
      keepalive,
    }),
    fetch(`/api/projects/${state.projectId}/files/${state.fileId}`, {
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
      keepalive,
    }),
  ]);
}

function hasUnsavedEdits(state: EditorState): boolean {
  return state.saveStatus === "dirty" && !!state.projectId && !!state.fileId;
}

export function Editor({ initial }: EditorProps) {
  const t = useTranslations("editor");
  const hydrate = useEditor((s) => s.hydrate);
  const reset = useEditor((s) => s.reset);
  const setSaveStatus = useEditor((s) => s.setSaveStatus);

  // Saves run one at a time, each reading the latest state when it starts,
  // so a slow PATCH can never land after (and overwrite) a newer one.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

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
      // Leaving the editor (back to projects, another page) used to drop
      // edits still waiting on the autosave debounce.
      const state = useEditor.getState();
      if (hasUnsavedEdits(state)) {
        saveChainRef.current
          .then(() => persist(state))
          .catch((err) => console.error("save on leave failed", err));
      }
      reset();
    };
  }, [initial, hydrate, reset]);

  // Closing or reloading the tab: best-effort save that survives the unload.
  useEffect(() => {
    function onPageHide() {
      const state = useEditor.getState();
      if (hasUnsavedEdits(state)) persist(state, true).catch(() => {});
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const saveOnce = useCallback(async () => {
    const state = useEditor.getState();
    if (!state.projectId || !state.fileId) return;
    setSaveStatus("saving");
    try {
      const [projRes, fileRes] = await persist(state);
      if (!projRes.ok) throw new Error(`project PATCH HTTP ${projRes.status}`);
      if (!fileRes.ok) throw new Error(`file PATCH HTTP ${fileRes.status}`);
      // An edit made while the request was in flight flipped the status
      // back to "dirty" and scheduled its own save. Claiming "saved" here
      // would cancel that save and silently drop the edit.
      if (useEditor.getState().saveStatus === "saving") {
        setSaveStatus("saved", new Date());
      }
    } catch (err) {
      console.error("autosave failed", err);
      if (useEditor.getState().saveStatus === "saving") setSaveStatus("error");
      toast.error(t("autosaveFailed"));
    }
  }, [setSaveStatus, t]);

  const save = useCallback(() => {
    const next = saveChainRef.current.then(saveOnce);
    saveChainRef.current = next;
    return next;
  }, [saveOnce]);

  // Force-save before file switch / run / publish / explicit Save click —
  // skips the debounce, and waits for a save already in flight.
  const flushSave = useCallback(async () => {
    if (useEditor.getState().saveStatus === "dirty") await save();
    else await saveChainRef.current;
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
  // job — the executor's own timeout normally lands well before this. It
  // also stops when the editor unmounts or the user switches files, so a
  // finished job never lands in another file's (or project's) console.
  const runAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => runAbortRef.current?.abort(), []);

  const runFile = useCallback(async () => {
    const state = useEditor.getState();
    if (!state.projectId || !state.fileId || state.isRunning) return;
    const abort = new AbortController();
    runAbortRef.current = abort;
    const stillCurrent = () =>
      !abort.signal.aborted && useEditor.getState().fileId === state.fileId;
    setIsRunning(true);
    setBottomTab("console");
    try {
      await flushSave();
      const res = await fetch(
        `/api/projects/${state.projectId}/files/${state.fileId}/run`,
        { method: "POST" },
      );
      if (res.status === 429) {
        toast.error(t("run.rateLimited"));
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      let job: ExecutionJob = await res.json();
      if (!stillCurrent()) return;
      setLastJob(job);

      const startedAt = Date.now();
      const MAX_POLL_MS = 90_000;
      const POLL_INTERVAL_MS = 500;
      while (
        (job.status === "queued" || job.status === "running") &&
        Date.now() - startedAt < MAX_POLL_MS
      ) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (!stillCurrent()) return;
        const pollRes = await fetch(`/api/jobs/${job.id}`, {
          signal: abort.signal,
        });
        if (!pollRes.ok) {
          throw new Error(`poll HTTP ${pollRes.status}`);
        }
        job = await pollRes.json();
        if (!stillCurrent()) return;
        setLastJob(job);
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      toast.error(t("run.failed"));
      console.error("run failed", err);
    } finally {
      // After an unmount the store may already belong to another project;
      // only the run that still owns it clears the flag.
      if (!abort.signal.aborted) setIsRunning(false);
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

  // Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo.
  //
  // We skip the handler when focus is on an INPUT/TEXTAREA/contenteditable
  // so the browser's native text-undo (which the user expects when they're
  // typing in the project name input or a Variable value) keeps working.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useEditor.getState().undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        useEditor.getState().redo();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <EditorTopBar onSaveNow={() => void save()} flushSave={flushSave} />
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
