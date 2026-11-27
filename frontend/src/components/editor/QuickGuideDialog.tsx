"use client";

import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/stores/editor";

const STEPS = ["palette", "connect", "properties", "run", "console", "save"] as const;

// Five-minute tour of the editor, opened from the "?" button in the top
// bar or from the empty-canvas card. Never opens by itself: a modal that
// pops up on load gets in the way of returning users (and of e2e tests).
export function QuickGuideDialog() {
  const t = useTranslations("editor.guide");
  const open = useEditor((s) => s.guideOpen);
  const setOpen = useEditor((s) => s.setGuideOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{t(`steps.${step}.title`)}</p>
                <p className="text-muted-foreground">{t(`steps.${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          {t("shortcuts")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
