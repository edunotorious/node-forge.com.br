"use client";

import { PALETTE_GROUPS } from "./nodes";

export function NodePalette() {
  return (
    <aside className="w-[240px] shrink-0 overflow-y-auto border-r bg-muted/30 p-3">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Paleta
      </h2>
      <div className="space-y-4">
        {PALETTE_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
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
    </aside>
  );
}
