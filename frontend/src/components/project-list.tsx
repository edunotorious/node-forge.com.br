"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CircuitBoard,
  Copy,
  ImageIcon,
  Loader2,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string | null;
  has_thumbnail: boolean;
  created_at: string;
  updated_at: string;
}

const QK = ["projects"] as const;

async function listProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("listProjects failed");
  return res.json();
}

type NewValues = { name: string; description?: string };
type RenameValues = { name: string };

async function createProject(values: NewValues): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error("createProject failed");
  return res.json();
}

async function renameProject(id: string, name: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("renameProject failed");
  return res.json();
}

async function deleteProjectReq(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("deleteProject failed");
}

async function duplicateProjectReq(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
  if (!res.ok) throw new Error("duplicateProject failed");
  return res.json();
}

async function uploadThumbnailReq(id: string, file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/projects/${id}/thumbnail`, {
    method: "PUT",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "uploadThumbnail failed");
  }
}

// Built outside the component so React 19's `react-hooks/purity` rule does
// not flag Math.random / new Date — they only run when the user submits, not
// during render.
function buildOptimisticProject(values: NewValues): Project {
  const now = new Date().toISOString();
  return {
    id: "optimistic-" + Math.random().toString(36).slice(2),
    name: values.name,
    description: values.description ?? null,
    has_thumbnail: false,
    created_at: now,
    updated_at: now,
  };
}

export function ProjectList({ initialData }: { initialData: Project[] }) {
  const t = useTranslations("projects");
  const qc = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState<Project | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // Single hidden file picker shared by every tile's "Change Project Image"
  // context menu item. Re-pointed by stashing the target project id in a
  // ref each time the menu fires.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTargetRef = useRef<string | null>(null);

  const newSchema = z.object({
    name: z.string().min(1, t("newDialog.nameRequired")).max(255),
    description: z.string().max(2000).optional(),
  });

  const renameSchema = z.object({
    name: z.string().min(1, t("renameDialog.nameRequired")).max(255),
  });

  const projects = useQuery({
    queryKey: QK,
    queryFn: listProjects,
    initialData,
  });

  const createMut = useMutation({
    mutationFn: createProject,
    onMutate: async (vals) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<Project[]>(QK);
      const optimistic = buildOptimisticProject(vals);
      qc.setQueryData<Project[]>(QK, (old = []) => [optimistic, ...old]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(t("toast.createFailed"));
    },
    onSuccess: () => {
      setNewOpen(false);
      newForm.reset();
      toast.success(t("toast.created"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameProject(id, name),
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<Project[]>(QK);
      qc.setQueryData<Project[]>(QK, (old = []) =>
        old.map((p) => (p.id === id ? { ...p, name } : p)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(t("toast.renameFailed"));
    },
    onSuccess: () => {
      setRenamingProject(null);
      toast.success(t("toast.renamed"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProjectReq,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<Project[]>(QK);
      qc.setQueryData<Project[]>(QK, (old = []) => old.filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(t("toast.deleteFailed"));
    },
    onSuccess: () => {
      setConfirmingId(null);
      toast.success(t("toast.deleted"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const duplicateMut = useMutation({
    mutationFn: duplicateProjectReq,
    onError: () => toast.error(t("toast.duplicateFailed")),
    onSuccess: () => {
      toast.success(t("toast.duplicated"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const uploadThumbnailMut = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadThumbnailReq(id, file),
    onError: () => toast.error(t("toast.imageUploadFailed")),
    onSuccess: () => {
      toast.success(t("toast.imageUploaded"));
    },
    // The list payload only carries has_thumbnail; the `<img>` URL is the
    // same so we just need React to rerender. Invalidating bumps the
    // cache-busting search param via setBumpKey too.
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const [thumbnailBumpKey, setThumbnailBumpKey] = useState(0);

  function onPickThumbnail(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const targetId = fileTargetRef.current;
    fileTargetRef.current = null;
    if (!file || !targetId) return;
    if (file.type !== "image/png") {
      toast.error(t("toast.invalidPng"));
      return;
    }
    uploadThumbnailMut.mutate(
      { id: targetId, file },
      { onSuccess: () => setThumbnailBumpKey((k) => k + 1) },
    );
  }

  const newForm = useForm<NewValues>({
    resolver: zodResolver(newSchema),
    defaultValues: { name: "", description: "" },
  });

  const renameForm = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: "" },
  });

  const items = projects.data ?? [];

  return (
    <div className="px-8 py-10 sm:px-12">
      <h1 className="font-heading text-4xl font-black sm:text-5xl">
        {t("title")}
      </h1>

      {/* Grid scales aggressively on wide monitors so single tiles don't
          balloon to half the viewport on 1920+ screens. The base 2-col
          layout stays for narrow widths. */}
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {/* "+" create tile — always first */}
        <Dialog
          open={newOpen}
          onOpenChange={(o) => {
            setNewOpen(o);
            if (o) newForm.reset();
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={t("createTileAria")}
              className="group flex aspect-[5/4] items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:scale-[1.02] hover:shadow-lg"
            >
              <Plus className="h-8 w-8 stroke-[2.5]" />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("newDialog.title")}</DialogTitle>
              <DialogDescription>{t("newDialog.description")}</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={newForm.handleSubmit((v) => createMut.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">{t("newDialog.name")}</Label>
                <Input id="name" autoFocus {...newForm.register("name")} />
                {newForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {newForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">
                  {t("newDialog.descriptionField")}
                </Label>
                <Input id="description" {...newForm.register("description")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("newDialog.submit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {items.map((p) => (
          <ProjectTile
            key={p.id}
            project={p}
            thumbnailBumpKey={thumbnailBumpKey}
            onRename={() => {
              renameForm.reset({ name: p.name });
              setRenamingProject(p);
            }}
            onChangeImage={() => {
              fileTargetRef.current = p.id;
              fileInputRef.current?.click();
            }}
            onDuplicate={() => duplicateMut.mutate(p.id)}
            onDelete={() => setConfirmingId(p.id)}
          />
        ))}
      </div>

      {items.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("empty.message")}
        </p>
      )}

      {/* Single hidden file input shared by every tile's Change Image
          context-menu item — see fileTargetRef. PNG only. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={onPickThumbnail}
      />

      {/* Rename dialog */}
      <Dialog
        open={renamingProject !== null}
        onOpenChange={(o) => {
          if (!o) setRenamingProject(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameDialog.title")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={renameForm.handleSubmit((v) => {
              if (renamingProject) {
                renameMut.mutate({ id: renamingProject.id, name: v.name });
              }
            })}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="rename-name">{t("renameDialog.name")}</Label>
              <Input
                id="rename-name"
                autoFocus
                {...renameForm.register("name")}
              />
              {renameForm.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {renameForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={renameMut.isPending}>
                {renameMut.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {renameMut.isPending
                  ? t("renameDialog.submitting")
                  : t("renameDialog.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={confirmingId !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmingId) deleteMut.mutate(confirmingId);
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending
                ? t("deleteDialog.confirming")
                : t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ProjectTileProps {
  project: Project;
  // Bumped on every successful thumbnail upload so the `<img>` reloads
  // instead of serving the prior cached bytes.
  thumbnailBumpKey: number;
  onRename: () => void;
  onChangeImage: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ProjectTile({
  project,
  thumbnailBumpKey,
  onRename,
  onChangeImage,
  onDuplicate,
  onDelete,
}: ProjectTileProps) {
  const t = useTranslations("projects");
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="space-y-2">
          <Link
            href={`/projects/${project.id}`}
            aria-label={t("card.openAria", { name: project.name })}
            className={cn(
              "group/card relative block aspect-[5/4] overflow-hidden rounded-xl bg-gradient-to-br from-muted to-muted/70 transition-all",
              "hover:scale-[1.02] hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            )}
          >
            {project.has_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/projects/${project.id}/thumbnail?v=${thumbnailBumpKey}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              // No thumbnail: show a stylized circuit icon at rest so the
              // card has visual identity (not just a flat gray box).
              <div className="absolute inset-0 grid place-items-center text-foreground/30 transition-opacity group-hover/card:opacity-60">
                <CircuitBoard className="size-12" strokeWidth={1.3} />
              </div>
            )}
            {/* Hover-only "open" affordance — orange chip in the corner so
                the user knows the card is clickable and what it does.
                Works for both thumbnail and placeholder states. */}
            <div className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition-opacity group-hover/card:opacity-100">
              <ArrowUpRight className="size-4" strokeWidth={2.5} />
            </div>
          </Link>
          <p className="truncate text-center font-heading text-sm font-bold">
            {project.name || t("card.untitled")}
          </p>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <PencilLine /> {t("contextMenu.rename")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onChangeImage}>
          <ImageIcon /> {t("contextMenu.changeImage")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onDuplicate}>
          <Copy /> {t("contextMenu.duplicate")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> {t("contextMenu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
