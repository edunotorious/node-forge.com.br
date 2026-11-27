"use client";

import { Star, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { StarRating } from "@/components/feedback/star-rating";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_PAGE_SIZE,
  type FeedbackItem,
  type FeedbackPage,
} from "@/lib/feedback";

// Community feedback wall: every feedback is public. Signed-in users get
// the form on top; visitors read and get a sign-in link.
export function FeedbackWall({
  initial,
  signedIn,
  from,
}: {
  initial: FeedbackPage;
  signedIn: boolean;
  from: string;
}) {
  const t = useTranslations("feedback");
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [average, setAverage] = useState(initial.average_rating);
  const [ratedCount, setRatedCount] = useState(initial.rated_count);
  const [loadingMore, setLoadingMore] = useState(false);

  // Keep the summary in step with local adds/deletes without a refetch.
  function applySummary(delta: 1 | -1, rating: number | null) {
    setTotal((n) => n + delta);
    if (rating === null) return;
    const sum = (average ?? 0) * ratedCount + delta * rating;
    const count = ratedCount + delta;
    setRatedCount(count);
    setAverage(count > 0 ? Math.round((sum / count) * 100) / 100 : null);
  }

  function onCreated(item: FeedbackItem) {
    setItems((list) => [item, ...list]);
    applySummary(1, item.rating);
  }

  async function onDelete(item: FeedbackItem) {
    if (!window.confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/feedback/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("deleteFailed"));
      return;
    }
    setItems((list) => list.filter((i) => i.id !== item.id));
    applySummary(-1, item.rating);
    toast.success(t("deleted"));
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/feedback?limit=${FEEDBACK_PAGE_SIZE}&offset=${items.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: FeedbackPage = await res.json();
      setItems((list) => {
        const seen = new Set(list.map((i) => i.id));
        return [...list, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setTotal(page.total);
    } catch (err) {
      console.error("load more feedback failed", err);
      toast.error(t("loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold">{t("wallTitle")}</h1>
        <p className="text-muted-foreground">{t("wallSubtitle")}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {average !== null && (
            <span className="flex items-center gap-1 font-semibold">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {t("average", { average, count: ratedCount })}
            </span>
          )}
          <span className="text-muted-foreground">{t("total", { count: total })}</span>
        </p>
      </header>

      {signedIn ? (
        <FeedbackForm from={from} onCreated={onCreated} />
      ) : (
        <div className="rounded-xl bg-muted/50 p-5 text-sm ring-1 ring-foreground/10">
          <p>{t("signInPrompt")}</p>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm">
              <Link href={{ pathname: "/login", query: { next: "/feedback" } }}>
                {t("signIn")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/register">{t("register")}</Link>
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="italic text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3" aria-label={t("listLabel")}>
          {items.map((item) => (
            <FeedbackCard key={item.id} item={item} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {items.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeedbackCard({
  item,
  onDelete,
}: {
  item: FeedbackItem;
  onDelete: (item: FeedbackItem) => void;
}) {
  const t = useTranslations("feedback");
  const format = useFormatter();
  const name = item.anonymous
    ? t("anonymous")
    : item.author
      ? (item.author.display_name ?? item.author.username ?? t("member"))
      : t("deletedAuthor");

  return (
    <li className="space-y-2 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{name}</span>
        {item.mine && (
          <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">
            {t("yours")}
          </span>
        )}
        {item.rating !== null && <StarRating value={item.rating} size="sm" />}
        <time
          dateTime={item.created_at}
          className="text-xs text-muted-foreground"
        >
          {format.dateTime(new Date(item.created_at), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
        {item.mine && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-destructive"
            onClick={() => onDelete(item)}
          >
            <Trash2 /> {t("delete")}
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{item.message}</p>
    </li>
  );
}

function FeedbackForm({
  from,
  onCreated,
}: {
  from: string;
  onCreated: (item: FeedbackItem) => void;
}) {
  const t = useTranslations("feedback");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const tooShort = message.trim().length < FEEDBACK_MIN_LENGTH;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), rating, anonymous, page: from }),
      });
      if (res.status === 429) {
        toast.error(t("rateLimited"));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated(await res.json());
      setRating(null);
      setMessage("");
      setAnonymous(false);
      toast.success(t("thanks"));
    } catch (err) {
      console.error("feedback failed", err);
      toast.error(t("failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl bg-background p-5 ring-1 ring-foreground/10"
    >
      <h2 className="font-semibold">{t("formTitle")}</h2>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t("ratingLabel")}</legend>
        <StarRating value={rating} onChange={setRating} />
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="feedback-message">{t("messageLabel")}</Label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          maxLength={FEEDBACK_MAX_LENGTH}
          rows={4}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="size-4 accent-primary"
        />
        {t("anonymousLabel")}
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("publicNotice")}</p>
        <Button type="submit" disabled={sending || tooShort}>
          {t("send")}
        </Button>
      </div>
    </form>
  );
}
