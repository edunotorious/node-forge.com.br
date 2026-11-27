"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

// Read-only stars when `onChange` is absent; clickable (click the current
// value again to clear it) otherwise.
export function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: "sm" | "md";
}) {
  const t = useTranslations("feedback");
  const icon = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const stars = [1, 2, 3, 4, 5].map((n) => {
    const filled = value !== null && n <= value;
    const star = (
      <Star
        className={cn(
          icon,
          filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50",
        )}
      />
    );
    if (!onChange) return <span key={n}>{star}</span>;
    return (
      <button
        key={n}
        type="button"
        aria-label={t("ratingValue", { n })}
        aria-pressed={value === n}
        onClick={() => onChange(value === n ? null : n)}
        className="rounded p-0.5 transition-transform hover:scale-110"
      >
        {star}
      </button>
    );
  });
  return onChange ? (
    <div className="flex gap-1">{stars}</div>
  ) : (
    <div className="flex gap-0.5" role="img" aria-label={value ? t("ratingValue", { n: value }) : t("noRating")}>
      {stars}
    </div>
  );
}
