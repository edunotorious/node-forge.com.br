"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 3;
const MAX_LENGTH = 2000;

// "Feedback" entry in the top bar: a rating plus a free-text note, stored
// with the page it was sent from. Used to collect what participants say
// during usability tests, and from any user afterwards.
export function FeedbackButton() {
  const t = useTranslations("feedback");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function reset() {
    setRating(null);
    setMessage("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < MIN_LENGTH) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          rating,
          // Path only, never query strings (they may carry tokens).
          page: pathname.split(/[?#]/)[0].slice(0, 200),
        }),
      });
      if (res.status === 429) {
        toast.error(t("rateLimited"));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t("thanks"));
      reset();
      setOpen(false);
    } catch (err) {
      console.error("feedback failed", err);
      toast.error(t("failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 transition-opacity hover:opacity-80"
      >
        <MessageSquareText className="h-4 w-4" />
        <span className="hidden sm:inline">{t("button")}</span>
        <span className="sr-only sm:hidden">{t("button")}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("ratingLabel")}</legend>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={t("ratingValue", { n })}
                    aria-pressed={rating === n}
                    onClick={() => setRating(rating === n ? null : n)}
                    className="rounded p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        "h-6 w-6",
                        rating !== null && n <= rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground",
                      )}
                    />
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="feedback-message">{t("messageLabel")}</Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
                maxLength={MAX_LENGTH}
                rows={5}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={sending || message.trim().length < MIN_LENGTH}
              >
                {t("send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
