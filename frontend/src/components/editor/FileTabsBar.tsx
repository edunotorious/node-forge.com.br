"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type Edge, type Node } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { RunControls } from "@/components/editor/RunControls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_CONFIG,
  type FunctionDef,
  type VariableDef,
} from "@/lib/graph-types";
import type { ProjectFileFull, ProjectFileSummary } from "@/lib/server-api";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

interface Props {
  // Called before switching files so the current file's edits hit the DB.
  flushSave: () => Promise<void>;
  // Triggered by the Play button in the run controls.
  onRun: () => void;
}

// Top tabs row inside the workspace: one tab per file in the project, a "+"
// to add, and the run controls pinned to the right.
export function FileTabsBar({ flushSave, onRun }: Props) {
  const t = useTranslations("editor.files");
  const files = useEditor((s) => s.files);
  const activeFileId = useEditor((s) => s.fileId);
  const projectId = useEditor((s) => s.projectId);
  const setFiles = useEditor((s) => s.setFiles);
  const loadFile = useEditor((s) => s.loadFile);
  const [switching, setSwitching] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  async function switchToFile(file: ProjectFileSummary) {
    if (!projectId || file.id === activeFileId || switching) return;
    setSwitching(true);
    try {
      await flushSave();
      const res = await fetch(`/api/projects/${projectId}/files/${file.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const full: ProjectFileFull = await res.json();
      const graph = full.graph_json ?? {};
      loadFile({
        fileId: full.id,
        fileName: full.name,
        nodes: (Array.isArray(graph.nodes) ? graph.nodes : []) as Node[],
        edges: (Array.isArray(graph.edges) ? graph.edges : []) as Edge[],
        config: { ...DEFAULT_CONFIG, ...(graph.config ?? {}) },
        variables: Array.isArray(graph.variables)
          ? (graph.variables as VariableDef[])
          : [],
        functions: Array.isArray(graph.functions)
          ? (graph.functions as FunctionDef[])
          : [],
      });
    } catch (err) {
      console.error("file switch failed", err);
      toast.error(t("switchFailed"));
    } finally {
      setSwitching(false);
    }
  }

  const sorted = [...files].sort((a, b) => a.position - b.position);

  return (
    <div className="flex h-9 items-stretch border-b bg-muted/30">
      <div className="flex flex-1 items-stretch gap-px overflow-x-auto pl-2">
        {sorted.map((f) => {
          const active = f.id === activeFileId;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => void switchToFile(f)}
              disabled={switching}
              className={cn(
                "relative shrink-0 px-4 text-sm font-medium transition-colors",
                "border-t-2 border-transparent",
                active
                  ? "border-t-primary bg-background text-foreground"
                  : "text-muted-foreground hover:bg-background/60",
              )}
            >
              {f.name}
            </button>
          );
        })}
        <button
          type="button"
          aria-label={t("addAria")}
          onClick={() => setNewOpen(true)}
          className="ml-1 self-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-1 pr-3">
        <RunControls onRun={onRun} />
      </div>

      <NewFileDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(file) => {
          setFiles([...files, file]);
        }}
      />
    </div>
  );
}

interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (file: ProjectFileSummary) => void;
}

type NewFileValues = { name: string };

function NewFileDialog({ open, onOpenChange, onCreated }: NewFileDialogProps) {
  const t = useTranslations("editor.files");
  const projectId = useEditor((s) => s.projectId);
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    name: z.string().min(1, t("nameRequired")).max(255),
  });

  const form = useForm<NewFileValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: NewFileValues) {
    if (!projectId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? t("createFailed"));
      }
      const full: ProjectFileFull = await res.json();
      onCreated({
        id: full.id,
        name: full.name,
        position: full.position,
        created_at: full.created_at,
        updated_at: full.updated_at,
      });
      toast.success(t("created"));
      onOpenChange(false);
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) form.reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newFileDialogTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nf-name">{t("name")}</Label>
            <Input
              id="nf-name"
              autoFocus
              placeholder={t("namePlaceholder")}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
