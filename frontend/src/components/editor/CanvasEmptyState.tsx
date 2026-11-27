"use client";

import { BookOpen, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { bellStateTemplate } from "@/lib/templates";
import { useEditor } from "@/stores/editor";

// Shown over an empty canvas. First-time users used to land on a blank
// grid with no hint of what to do; this gives them a one-click working
// circuit plus the three moves that build one by hand. The wrapper lets
// pointer events through so drag-and-drop onto the canvas still works.
export function CanvasEmptyState() {
  const t = useTranslations("editor.emptyCanvas");
  const loadTemplate = useEditor((s) => s.loadTemplate);
  const setGuideOpen = useEditor((s) => s.setGuideOpen);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-4">
      <div className="pointer-events-auto w-full max-w-md space-y-4 rounded-xl bg-background/95 p-5 shadow-lg ring-1 ring-foreground/10">
        <div>
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => loadTemplate(bellStateTemplate())}>
            <Sparkles /> {t("loadExample")}
          </Button>
          <Button variant="outline" onClick={() => setGuideOpen(true)}>
            <BookOpen /> {t("openGuide")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("exampleHint")}</p>
      </div>
    </div>
  );
}
