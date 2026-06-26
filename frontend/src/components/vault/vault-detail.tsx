"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Heart,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import type {
  VaultFileSnapshot,
  VaultListingDetail,
} from "@/lib/server-api";

interface Viewer {
  id: string;
  isAuthor: boolean;
}

interface VaultDetailProps {
  listing: VaultListingDetail;
  viewer: Viewer | null;
}

export function VaultDetail({ listing, viewer }: VaultDetailProps) {
  const t = useTranslations("vault");
  const router = useRouter();
  const qc = useQueryClient();
  const [liked, setLiked] = useState<boolean>(!!listing.liked_by_me);
  const [likeCount, setLikeCount] = useState<number>(listing.like_count);
  const [activeFile, setActiveFile] = useState<VaultFileSnapshot>(
    () =>
      listing.files.toSorted((a, b) => a.position - b.position)[0] ??
      listing.files[0],
  );

  const toggleLike = useMutation({
    mutationFn: async (nextLiked: boolean) => {
      const res = await fetch(`/api/vault/${listing.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      });
      if (res.status === 401) throw new Error("not_authenticated");
      if (!res.ok) throw new Error(`like ${res.status}`);
    },
    onSuccess: (_, nextLiked) => {
      setLiked(nextLiked);
      setLikeCount((c) => (nextLiked ? c + 1 : Math.max(0, c - 1)));
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "not_authenticated") {
        toast.error(t("toast.signInToInteract"));
        router.push("/login");
      } else {
        toast.error(t("toast.likeFailed"));
      }
    },
  });

  const clone = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vault/${listing.id}/clone`, {
        method: "POST",
      });
      if (res.status === 401) throw new Error("not_authenticated");
      if (!res.ok) throw new Error(`clone ${res.status}`);
      return (await res.json()) as { project_id: string };
    },
    onSuccess: ({ project_id }) => {
      toast.success(t("toast.cloneSuccess"));
      router.push(`/projects/${project_id}`);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "not_authenticated") {
        toast.error(t("toast.signInToClone"));
        router.push("/login");
      } else {
        toast.error(t("toast.cloneFailed"));
      }
    },
  });

  const republish = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vault/${listing.id}/republish`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "republish failed");
      }
    },
    onSuccess: () => {
      toast.success(t("toast.republishSuccess"));
      router.refresh();
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("toast.republishFailed"),
      );
    },
  });

  const unpublish = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vault/${listing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete ${res.status}`);
    },
    onSuccess: () => {
      toast.success(t("toast.unpublishSuccess"));
      qc.invalidateQueries({ queryKey: ["vault"] });
      router.push("/vault");
    },
    onError: () => toast.error(t("toast.unpublishFailed")),
  });

  const authorName =
    listing.author?.display_name ??
    listing.author?.username ??
    t("deletedAuthor");
  const sortedFiles = listing.files
    .toSorted((a, b) => a.position - b.position);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <Link
        href="/vault"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("backToList")}
      </Link>

      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <h1 className="font-heading text-3xl font-black sm:text-4xl">
            {listing.title}
          </h1>
          {listing.description ? (
            <p className="mt-3 max-w-3xl text-base text-muted-foreground">
              {listing.description}
            </p>
          ) : null}
          {listing.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1">
              {listing.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/vault?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full bg-foreground/5 px-3 py-1 text-sm font-medium hover:bg-foreground/10"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("by")}</span>
            <span className="font-medium text-foreground">{authorName}</span>
            <span>·</span>
            <span>
              {new Date(listing.published_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:w-56">
          <Button
            size="lg"
            onClick={() => clone.mutate()}
            disabled={clone.isPending}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            {clone.isPending ? t("cloning") : t("cloneToProjects")}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleLike.mutate(!liked)}
              disabled={toggleLike.isPending}
              className="flex-1 gap-2"
            >
              <Heart
                className={
                  "h-4 w-4 " + (liked ? "fill-primary text-primary" : "")
                }
              />
              {likeCount}
            </Button>
            <span className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              {listing.clone_count}
            </span>
          </div>

          {viewer?.isAuthor ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => republish.mutate()}
                disabled={republish.isPending}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {republish.isPending ? t("republishing") : t("republish")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(t("unpublishConfirm"))) {
                    unpublish.mutate();
                  }
                }}
                disabled={unpublish.isPending}
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("unpublish")}
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {sortedFiles.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {sortedFiles.map((file) => (
            <button
              key={file.name}
              type="button"
              onClick={() => setActiveFile(file)}
              className={
                "rounded-full px-3 py-1 text-sm font-medium transition-colors " +
                (activeFile.name === file.name
                  ? "bg-foreground text-background"
                  : "bg-foreground/5 hover:bg-foreground/10")
              }
            >
              {file.name}
            </button>
          ))}
        </div>
      ) : null}

      <FilePreview file={activeFile} />

      <CommentsSection listingId={listing.id} viewer={viewer} />
    </div>
  );
}

function FilePreview({ file }: { file: VaultFileSnapshot }) {
  const t = useTranslations("vault");
  const config = file.graph_json.config ?? {};
  const nodes = file.graph_json.nodes ?? [];
  const edges = file.graph_json.edges ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("preview.qubits")} value={config.num_qubits ?? 0} />
        <Stat label={t("preview.classical")} value={config.num_classical ?? 0} />
        <Stat label={t("preview.shots")} value={config.shots ?? 0} />
        <Stat label={t("preview.gates")} value={nodes.length} />
      </div>

      {nodes.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t("preview.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {t("preview.gateSequence")}
          </h3>
          <ol className="space-y-2">
            {nodes.map((node, idx) => (
              <li
                key={node.id}
                className="flex items-start gap-3 rounded-lg bg-muted/30 px-4 py-2 text-sm"
              >
                <span className="mt-0.5 inline-block w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {idx + 1}.
                </span>
                <div className="flex-1">
                  <div className="font-mono text-sm font-semibold">
                    {prettyNodeType(node.type)}
                  </div>
                  {Object.keys(node.data ?? {}).length > 0 ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {Object.entries(node.data ?? {})
                        .map(([k, v]) => `${k}=${formatValue(v)}`)
                        .join(", ")}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            {edges.length} {t("preview.connections")}
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-heading text-2xl font-black">{value}</div>
    </div>
  );
}

function prettyNodeType(type: string | undefined): string {
  if (!type) return "node";
  // qiskit.hadamard → Hadamard
  const last = type.split(".").pop() ?? type;
  return last
    .split("_")
    .map((s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (v === null || v === undefined) return "—";
  return String(v);
}

interface Comment {
  id: string;
  body: string;
  deleted: boolean;
  created_at: string;
  edited_at: string | null;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    has_avatar: boolean;
  } | null;
}

function CommentsSection({
  listingId,
  viewer,
}: {
  listingId: string;
  viewer: Viewer | null;
}) {
  const t = useTranslations("vault");
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const comments = useQuery({
    queryKey: ["vault-comments", listingId],
    queryFn: async () => {
      const res = await fetch(`/api/vault/${listingId}/comments`);
      if (!res.ok) throw new Error(`comments ${res.status}`);
      return (await res.json()) as Comment[];
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vault/${listingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "post failed");
      }
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["vault-comments", listingId] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("toast.commentFailed")),
  });

  const remove = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(
        `/api/vault/${listingId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`delete ${res.status}`);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["vault-comments", listingId] }),
    onError: () => toast.error(t("toast.commentDeleteFailed")),
  });

  const list = comments.data ?? [];

  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold">
        <MessageCircle className="h-5 w-5" />
        {t("comments.title")}
        <span className="text-sm font-normal text-muted-foreground">
          ({list.length})
        </span>
      </h2>

      {viewer ? (
        <div className="mb-6">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("comments.placeholder")}
            maxLength={2000}
            rows={3}
            className="resize-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {draft.length}/2000
            </span>
            <Button
              size="sm"
              onClick={() => post.mutate()}
              disabled={!draft.trim() || post.isPending}
            >
              {post.isPending ? t("comments.posting") : t("comments.post")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary underline">
            {t("comments.signInToComment")}
          </Link>
        </div>
      )}

      {comments.isPending ? (
        <p className="text-sm text-muted-foreground">{t("comments.loading")}</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("comments.empty")}
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map((c) => {
            const isMine = viewer?.id === c.author?.id;
            const name =
              c.author?.display_name ??
              c.author?.username ??
              t("deletedAuthor");
            return (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <time dateTime={c.created_at}>
                      {new Date(c.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    {isMine && !c.deleted ? (
                      <button
                        type="button"
                        onClick={() => remove.mutate(c.id)}
                        className="text-destructive hover:underline"
                      >
                        {t("comments.delete")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p
                  className={
                    "whitespace-pre-wrap text-sm " +
                    (c.deleted ? "italic text-muted-foreground" : "")
                  }
                >
                  {c.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
