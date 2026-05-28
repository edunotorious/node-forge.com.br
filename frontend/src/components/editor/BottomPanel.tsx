"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useSyncExternalStore } from "react";

import { ConsoleView } from "@/components/editor/ConsoleView";
import { ImportsView } from "@/components/editor/ImportsView";
import { TerminalView } from "@/components/editor/TerminalView";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

const HEIGHT_STORAGE_KEY = "nodeforge.editor.bottomPanelHeight";
// Same-tab writes to localStorage don't fire the native `storage` event, so
// we dispatch this one alongside any persist call. Other tabs still get
// the native `storage` event for free.
const HEIGHT_CHANGE_EVENT = "nodeforge:bottompanel-height";
const DEFAULT_HEIGHT = 288;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_VH = 0.7; // 70% of viewport — leave room for the canvas

function readStoredHeight(): number {
  const raw = window.localStorage.getItem(HEIGHT_STORAGE_KEY);
  if (!raw) return DEFAULT_HEIGHT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_HEIGHT;
  return Math.max(MIN_HEIGHT, parsed);
}

function subscribeToStoredHeight(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(HEIGHT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(HEIGHT_CHANGE_EVENT, callback);
  };
}

function persistHeight(value: number) {
  try {
    window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(Math.round(value)));
    window.dispatchEvent(new Event(HEIGHT_CHANGE_EVENT));
  } catch {
    // localStorage can throw in private mode / sandboxed iframes — we
    // don't care; the height just resets next reload.
  }
}

// Bottom dock with three tabs: Console / Terminal / Imports. The top edge
// is a drag handle — users can pull it up/down to resize. The chosen
// height is persisted to localStorage so it survives reloads.
export function BottomPanel() {
  const t = useTranslations("editor");
  const tab = useEditor((s) => s.bottomTab);
  const setTab = useEditor((s) => s.setBottomTab);
  const collapsed = useEditor((s) => s.bottomPanelCollapsed);
  const toggle = useEditor((s) => s.toggleBottomPanel);
  // useSyncExternalStore is the React 19-blessed way to read from an
  // external source like localStorage without producing an SSR/CSR
  // hydration mismatch: the third arg is the SSR snapshot (server-safe
  // default), while the second is the client snapshot read on each
  // render. The subscribe channel picks up both other-tab writes
  // (`storage`) and same-tab writes (our custom event from
  // `persistHeight`).
  const persistedHeight = useSyncExternalStore(
    subscribeToStoredHeight,
    readStoredHeight,
    () => DEFAULT_HEIGHT,
  );
  // During a drag we override persistedHeight without committing to
  // localStorage on every mousemove — the commit lands on mouseup.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const height = dragHeight ?? persistedHeight;
  const [resizing, setResizing] = useState(false);
  // Tracks the LATEST in-drag height for the mouseup handler — setState is
  // async/batched, so a closure over `height` wouldn't see the final value.
  const latestDragHeight = useRef(DEFAULT_HEIGHT);

  function startResize(e: React.MouseEvent) {
    if (collapsed) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    latestDragHeight.current = startH;
    setResizing(true);

    function onMove(ev: MouseEvent) {
      const maxH = Math.floor(window.innerHeight * MAX_HEIGHT_VH);
      // Dragging up shrinks clientY, which should GROW the panel.
      const next = Math.max(
        MIN_HEIGHT,
        Math.min(maxH, startH + (startY - ev.clientY)),
      );
      latestDragHeight.current = next;
      setDragHeight(next);
    }
    function onUp() {
      setResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Commit the final drag value to localStorage. The persist call
      // dispatches HEIGHT_CHANGE_EVENT which re-runs the external-store
      // snapshot, so persistedHeight updates and dragHeight can drop back
      // to null without flicker.
      persistHeight(latestDragHeight.current);
      setDragHeight(null);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="flex shrink-0 flex-col border-t bg-muted/30"
      style={{ height: collapsed ? 36 : height }}
    >
      {/* Drag handle — only active when the panel is expanded. The
          slightly larger hit area (h-1.5 with negative margin) makes
          it forgiving on small monitors without visually intruding. */}
      {!collapsed && (
        <div
          onMouseDown={startResize}
          aria-hidden="true"
          className={cn(
            "-mt-1 h-1.5 shrink-0 cursor-ns-resize",
            resizing ? "bg-primary/40" : "hover:bg-primary/20",
          )}
        />
      )}
      <div className="flex h-9 shrink-0 items-stretch">
        <TabButton
          label={t("tabs.console")}
          active={tab === "console"}
          onClick={() => setTab("console")}
        />
        <TabButton
          label={t("tabs.terminal")}
          active={tab === "terminal"}
          onClick={() => setTab("terminal")}
        />
        <TabButton
          label={t("tabs.imports")}
          active={tab === "imports"}
          onClick={() => setTab("imports")}
        />
        <div className="ml-auto flex items-center pr-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "expand" : "collapse"}
            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {!collapsed && (
        // pointer-events-none during resize so React Flow / Canvas don't
        // hijack the move events — the document-level listener handles
        // them. Without this the panel can get "stuck" mid-drag if the
        // cursor crosses into the canvas region.
        <div
          className={cn(
            "flex-1 overflow-auto bg-background/40 p-3 text-xs",
            resizing && "pointer-events-none",
          )}
        >
          {tab === "console" && <ConsoleView />}
          {tab === "terminal" && <TerminalView />}
          {tab === "imports" && <ImportsView />}
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 text-xs font-medium transition-colors",
        "border-b-2 border-transparent",
        active
          ? "border-b-primary bg-background text-foreground"
          : "text-muted-foreground hover:bg-background/60",
      )}
    >
      {label}
    </button>
  );
}
