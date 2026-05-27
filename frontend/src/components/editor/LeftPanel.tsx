"use client";

import { useTranslations } from "next-intl";

import { ClassesSection } from "@/components/editor/ClassesSection";
import { FunctionsSection } from "@/components/editor/FunctionsSection";
import { NodePalette } from "@/components/editor/NodePalette";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { VariablesSection } from "@/components/editor/VariablesSection";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

// Left workspace panel. Three tabs at the top — Details, Classes, Inspect —
// each renders different content into the body below. Inspect surfaces the
// selected-node properties (which previously lived in a separate right
// panel). Width is fixed; the canvas to the right fills the rest.
export function LeftPanel() {
  const t = useTranslations("editor");
  const tab = useEditor((s) => s.leftTab);
  const setTab = useEditor((s) => s.setLeftTab);

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r bg-muted/30">
      <div className="flex h-9 shrink-0 items-stretch border-b bg-muted/40">
        <TabButton
          label={t("tabs.details")}
          active={tab === "details"}
          onClick={() => setTab("details")}
        />
        <TabButton
          label={t("tabs.classes")}
          active={tab === "classes"}
          onClick={() => setTab("classes")}
        />
        <TabButton
          label={t("tabs.inspect")}
          active={tab === "inspect"}
          onClick={() => setTab("inspect")}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "details" && <DetailsTab />}
        {tab === "classes" && <ClassesPanel />}
        {tab === "inspect" && <PropertiesPanel embedded />}
      </div>
    </aside>
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
        "flex-1 px-2 text-xs font-medium transition-colors",
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

// Details = the file's authoring surface. Three stacked sections:
//   1. Palette — drag gates / built-in nodes onto the canvas
//   2. Variables — user-defined typed values for the active file
//   3. Functions — user-defined function definitions for the active file
function DetailsTab() {
  return (
    <div className="space-y-6 p-3">
      <NodePalette embedded />
      <VariablesSection />
      <FunctionsSection />
    </div>
  );
}

function ClassesPanel() {
  return (
    <div className="p-3">
      <ClassesSection />
    </div>
  );
}
