"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { PALETTE_GROUPS } from "./nodes";

// `embedded` (default): rendered inside the LeftPanel's "Details" tab — no
// outer aside, no width. Pass `embedded={false}` to use this component as a
// standalone sidebar (kept for flexibility; no current callers).
export function NodePalette({ embedded = true }: { embedded?: boolean }) {
  const t = useTranslations("editor.palette");
  const Wrapper = embedded ? "div" : "aside";
  return (
    <Wrapper
      className={cn(
        !embedded && "w-[240px] shrink-0 overflow-y-auto border-r bg-muted/30 p-3",
      )}
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </h2>
      <div className="space-y-4">
        {PALETTE_GROUPS.map((group) => (
          <div key={group.labelKey}>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(`groups.${group.labelKey}`)}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/x-nodeforge-node-type",
                      item.type,
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="cursor-grab rounded border bg-background px-2 py-1.5 text-xs hover:border-primary hover:bg-accent active:cursor-grabbing"
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Wrapper>
  );
}
