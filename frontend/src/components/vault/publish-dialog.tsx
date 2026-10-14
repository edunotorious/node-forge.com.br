"use client";

import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PriceModeToggle } from "@/components/vault/listing-visuals";
import { useRouter } from "@/i18n/navigation";
import { isValidPaidPrice, parsePriceInput } from "@/lib/price";

const TAG_LIMIT = 5;

interface PublishDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The listing snapshots what the server has, so pending editor edits must
  // be saved first or the published copy would miss them.
  beforePublish?: () => Promise<void>;
}

// "Publish to Vault" — snapshot the current project under a new title
// + description + up to 5 tags, free by default or with a price. The dialog seeds the title from the
// project name so the common case is one click + Submit.
export function PublishToVaultDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  beforePublish,
}: PublishDialogProps) {
  const t = useTranslations("vault.publish");
  const router = useRouter();
  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [paid, setPaid] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");

  // When the project is renamed externally, refresh the seed title each
  // time the dialog opens — without clobbering a half-typed title from
  // a previous attempt that's still open. Adjusted during render rather
  // than in an effect (react.dev "adjusting state when a prop changes").
  const [seedKey, setSeedKey] = useState({ open, projectName });
  if (seedKey.open !== open || seedKey.projectName !== projectName) {
    setSeedKey({ open, projectName });
    if (open) {
      setTitle(projectName);
      setDescription("");
      setTags([]);
      setTagDraft("");
      setPaid(false);
      setPriceDraft("");
    }
  }

  const publish = useMutation({
    mutationFn: async () => {
      await beforePublish?.();
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          description: description.trim(),
          tags,
          price_cents: paid ? priceCents : 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `publish ${res.status}`);
      }
      return (await res.json()) as { slug: string };
    },
    onSuccess: ({ slug }) => {
      toast.success(t("toast.success"));
      onOpenChange(false);
      router.push(`/vault/${slug}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("toast.failed")),
  });

  function addTag(raw: string) {
    const norm = raw
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!norm || norm.length < 2 || norm.length > 50) return;
    if (tags.includes(norm)) return;
    if (tags.length >= TAG_LIMIT) return;
    setTags((existing) => [...existing, norm]);
    setTagDraft("");
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
    } else if (
      e.key === "Backspace" &&
      tagDraft === "" &&
      tags.length > 0
    ) {
      setTags((existing) => existing.slice(0, -1));
    }
  }

  const titleValid = title.trim().length >= 3 && title.trim().length <= 200;
  const priceCents = parsePriceInput(priceDraft);
  const priceValid = !paid || isValidPaidPrice(priceCents);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vault-publish-title">{t("titleField")}</Label>
            <Input
              id="vault-publish-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-publish-description">
              {t("descriptionField")}
            </Label>
            <Textarea
              id="vault-publish-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={t("descriptionPlaceholder")}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-publish-tags">
              {t("tagsField")}{" "}
              <span className="text-xs text-muted-foreground">
                ({tags.length}/{TAG_LIMIT})
              </span>
            </Label>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() =>
                        setTags((existing) => existing.filter((t) => t !== tag))
                      }
                      className="hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <Input
              id="vault-publish-tags"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => tagDraft && addTag(tagDraft)}
              placeholder={t("tagsPlaceholder")}
              disabled={tags.length >= TAG_LIMIT}
            />
            <p className="text-xs text-muted-foreground">{t("tagsHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-publish-price">{t("priceField")}</Label>
            <PriceModeToggle paid={paid} onChange={setPaid} />
            {paid ? (
              <Input
                id="vault-publish-price"
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                inputMode="decimal"
                placeholder={t("pricePlaceholder")}
                aria-invalid={!priceValid}
              />
            ) : null}
            <p
              className={
                "text-xs " +
                (paid && priceDraft && !priceValid
                  ? "text-destructive"
                  : "text-muted-foreground")
              }
            >
              {paid && priceDraft && !priceValid
                ? t("priceInvalid")
                : paid
                  ? t("priceHelp")
                  : t("freeHelp")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={publish.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={() => publish.mutate()}
            disabled={!titleValid || !priceValid || publish.isPending}
          >
            {publish.isPending ? t("publishing") : t("publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
