"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// Small inline "PT | EN" toggle. Replays the current pathname under the chosen
// locale via next-intl's locale-aware router (which adds/strips the prefix per
// the `as-needed` routing config).
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === current) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  const labels: Record<Locale, string> = {
    "pt-BR": "PT",
    en: "EN",
  };

  return (
    <div
      role="group"
      aria-label={t("languageSwitcherAria")}
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        pending && "opacity-60",
        className,
      )}
    >
      {routing.locales.map((locale, idx) => (
        <span key={locale} className="flex items-center gap-1">
          {idx > 0 && <span aria-hidden="true">|</span>}
          <button
            type="button"
            onClick={() => switchTo(locale)}
            disabled={pending}
            className={cn(
              "cursor-pointer transition-opacity hover:opacity-100 disabled:cursor-not-allowed",
              locale === current ? "opacity-100" : "opacity-60",
            )}
          >
            {labels[locale]}
          </button>
        </span>
      ))}
    </div>
  );
}
