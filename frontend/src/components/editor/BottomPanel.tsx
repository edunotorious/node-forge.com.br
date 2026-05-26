"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConsoleView } from "@/components/editor/ConsoleView";
import { ImportsView } from "@/components/editor/ImportsView";
import { TerminalView } from "@/components/editor/TerminalView";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

// Bottom dock with three tabs: Console / Terminal / Imports. All three are
// stubs in this phase — Console is wired up to executor stdout in #10,
// Terminal hosts a REPL, Imports lists installable packages.
export function BottomPanel() {
  const t = useTranslations("editor");
  const tab = useEditor((s) => s.bottomTab);
  const setTab = useEditor((s) => s.setBottomTab);
  const collapsed = useEditor((s) => s.bottomPanelCollapsed);
  const toggle = useEditor((s) => s.toggleBottomPanel);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-t bg-muted/30 transition-[height]",
        // h-72 leaves room for the Imports two-column layout to breathe;
        // collapsed shows just the tab strip.
        collapsed ? "h-9" : "h-72",
      )}
    >
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
        <div className="flex-1 overflow-auto bg-background/40 p-3 text-xs">
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
