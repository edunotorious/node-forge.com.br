"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { PALETTE_GROUPS } from "@/components/editor/nodes";
import { cn } from "@/lib/utils";

interface Props {
  screenX: number;
  screenY: number;
  onPick: (nodeType: string) => void;
  onClose: () => void;
}

// Floating command-palette-style popup. Opened by right-clicking the empty
// canvas; the parent supplies the screen coords so we can position-fix the
// popup right at the cursor. Closing happens on Esc, outside-click, or
// after a node is picked.
export function SearchNodePopup({ screenX, screenY, onPick, onClose }: Props) {
  const t = useTranslations("editor.searchNode");
  const tGroups = useTranslations("editor.palette.groups");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Filtered flat list — used for keyboard navigation (arrow + enter).
  // Display still groups by category for readability.
  const flatResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { type: string; label: string; groupKey: string }[] = [];
    for (const group of PALETTE_GROUPS) {
      for (const item of group.items) {
        if (!q || item.label.toLowerCase().includes(q)) {
          out.push({ ...item, groupKey: group.labelKey });
        }
      }
    }
    return out;
  }, [query]);

  // Clamp during render rather than syncing via useEffect — the new
  // react-hooks/set-state-in-effect rule flags the effect version, and the
  // clamped value is what we want to use everywhere downstream anyway.
  const safeIndex =
    flatResults.length === 0
      ? 0
      : Math.min(activeIndex, flatResults.length - 1);

  // Esc closes; outside-click closes. Capture phase on document so we beat
  // any other handlers on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(Math.min(safeIndex + 1, flatResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(Math.max(safeIndex - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const pick = flatResults[safeIndex];
        if (pick) onPick(pick.type);
      }
    }
    function onDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose, onPick, flatResults, safeIndex]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clamp the popup inside the viewport — opening near the right edge would
  // otherwise spill off-screen. 280px width matches the className below.
  const POPUP_W = 280;
  const POPUP_H = 320;
  const x = Math.min(screenX, window.innerWidth - POPUP_W - 8);
  const y = Math.min(screenY, window.innerHeight - POPUP_H - 8);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", left: x, top: y, width: POPUP_W }}
      className="z-50 flex flex-col rounded-lg bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/15"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("placeholder")}
        className="h-9 rounded-t-lg border-b bg-background px-3 text-sm outline-none focus:ring-3 focus:ring-ring/50"
      />
      <div className="max-h-72 overflow-y-auto p-1 text-xs">
        {flatResults.length === 0 ? (
          <p className="p-2 italic text-muted-foreground">{t("empty")}</p>
        ) : (
          renderGrouped(flatResults, safeIndex, tGroups, (type) => onPick(type))
        )}
      </div>
    </div>
  );
}

function renderGrouped(
  results: { type: string; label: string; groupKey: string }[],
  activeIndex: number,
  tGroups: (key: string) => string,
  onPick: (nodeType: string) => void,
) {
  // Re-group while keeping the global flat index — that index is what the
  // keyboard nav uses to highlight. Map flat positions to entries first.
  const grouped = new Map<string, typeof results>();
  for (const r of results) {
    const list = grouped.get(r.groupKey) ?? [];
    list.push(r);
    grouped.set(r.groupKey, list);
  }

  let globalIdx = -1;
  const blocks: React.ReactNode[] = [];
  for (const [groupKey, items] of grouped) {
    blocks.push(
      <div
        key={`hdr-${groupKey}`}
        className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {tGroups(groupKey)}
      </div>,
    );
    for (const item of items) {
      globalIdx += 1;
      const isActive = globalIdx === activeIndex;
      blocks.push(
        <button
          key={item.type}
          type="button"
          onClick={() => onPick(item.type)}
          className={cn(
            "block w-full rounded px-2 py-1 text-left",
            isActive
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/60",
          )}
        >
          {item.label}
        </button>,
      );
    }
  }
  return blocks;
}
