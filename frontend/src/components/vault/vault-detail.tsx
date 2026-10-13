"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Atom,
  Copy,
  FileText,
  Heart,
  Layers,
  Lock,
  MessageCircle,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AuthorAvatar,
  authorLabel,
  ListingCover,
  PriceModeToggle,
} from "@/components/vault/listing-visuals";
import { Link, useRouter } from "@/i18n/navigation";
import { formatPrice, isValidPaidPrice, parsePriceInput } from "@/lib/price";
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
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const isPaid = listing.price_cents > 0;
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
      if (res.status === 402) throw new Error("payment_required");
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
      } else if (err instanceof Error && err.message === "payment_required") {
        toast.error(t("purchase.paymentsSoon"));
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
    authorLabel(listing.author, t);
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

      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          <ListingCover
            slug={listing.slug}
            numQubits={listing.num_qubits}
            nodeCount={listing.node_count}
            className="mb-6 aspect-[16/6] rounded-2xl"
          />
          <h1 className="font-heading text-3xl font-black sm:text-4xl">
            {listing.title}
          </h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <AuthorAvatar name={authorName} />
            <span>{t("by")}</span>
            <span className="font-medium text-foreground">{authorName}</span>
            <span>·</span>
            <span>
              {new Date(listing.published_at).toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          {listing.description ? (
            <p className="mt-4 max-w-3xl whitespace-pre-line text-base text-muted-foreground">
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
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("purchase.priceLabel")}
            </div>
            <div
              className={
                "mt-1 font-heading text-3xl font-black " +
                (isPaid ? "" : "text-emerald-600")
              }
            >
              {isPaid
                ? formatPrice(listing.price_cents, listing.currency, locale)
                : t("price.free")}
            </div>
          </div>

          {listing.locked ? (
            <>
              <Button size="lg" disabled className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                {t("purchase.buySoon")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("purchase.paymentsSoon")}
              </p>
            </>
          ) : (
            <Button
              size="lg"
              onClick={() => clone.mutate()}
              disabled={clone.isPending}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              {clone.isPending ? t("cloning") : t("cloneToProjects")}
            </Button>
          )}

          <ul className="space-y-2 border-t border-border pt-4 text-sm">
            <DetailFact icon={Atom} label={t("preview.qubits")} value={listing.num_qubits} />
            <DetailFact icon={Layers} label={t("preview.gates")} value={listing.node_count} />
            <DetailFact icon={FileText} label={t("purchase.files")} value={listing.file_count} />
            <DetailFact icon={Sparkles} label={t("card.clones")} value={listing.clone_count} />
          </ul>

          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleLike.mutate(!liked)}
            disabled={toggleLike.isPending}
            className="gap-2"
          >
            <Heart
              className={
                "h-4 w-4 " + (liked ? "fill-primary text-primary" : "")
              }
            />
            {likeCount}
          </Button>

          {viewer?.isAuthor ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {isPaid ? (
                <p className="text-xs text-muted-foreground">
                  {t("purchase.ownerNote")}
                </p>
              ) : null}
              <PriceEditor
                listingId={listing.id}
                priceCents={listing.price_cents}
              />
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
        </aside>
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

      <FilePreview file={activeFile} locked={listing.locked} />

      <CommentsSection listingId={listing.id} viewer={viewer} />
    </div>
  );
}

function DetailFact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </li>
  );
}

// Author-only: switch the listing between free and paid, or reprice it.
function PriceEditor({
  listingId,
  priceCents,
}: {
  listingId: string;
  priceCents: number;
}) {
  const t = useTranslations("vault");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [paid, setPaid] = useState(priceCents > 0);
  const [draft, setDraft] = useState(
    priceCents > 0
      ? (priceCents / 100).toLocaleString(locale, { minimumFractionDigits: 2 })
      : "",
  );
  const parsed = paid ? parsePriceInput(draft) : 0;
  const valid = !paid || isValidPaidPrice(parsed);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vault/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_cents: parsed }),
      });
      if (!res.ok) throw new Error(`price ${res.status}`);
    },
    onSuccess: () => {
      toast.success(t("toast.priceSaved"));
      setEditing(false);
      router.refresh();
    },
    onError: () => toast.error(t("toast.priceFailed")),
  });

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        className="gap-2"
      >
        <Tag className="h-3.5 w-3.5" />
        {t("purchase.editPrice")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      <PriceModeToggle paid={paid} onChange={setPaid} />
      {paid ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode="decimal"
          placeholder={t("publish.pricePlaceholder")}
          aria-label={t("publish.priceField")}
          aria-invalid={!valid}
        />
      ) : null}
      {paid && draft && !valid ? (
        <p className="text-xs text-destructive">{t("publish.priceInvalid")}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => save.mutate()}
          disabled={!valid || save.isPending}
        >
          {t("purchase.savePrice")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={save.isPending}
        >
          {t("publish.cancel")}
        </Button>
      </div>
    </div>
  );
}

function FilePreview({
  file,
  locked,
}: {
  file: VaultFileSnapshot;
  locked: boolean;
}) {
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
        {locked ? null : (
          <Stat label={t("preview.gates")} value={nodes.length} />
        )}
      </div>

      {locked ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
          <p className="font-heading text-lg font-bold">
            {t("purchase.lockedTitle")}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("purchase.lockedBody")}
          </p>
        </div>
      ) : nodes.length === 0 ? (
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
              authorLabel(c.author, t);
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
