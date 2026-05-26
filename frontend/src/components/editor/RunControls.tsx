"use client";

import { Loader2, Pause, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

// Run controls — Play wires to the executor (Phase 7). Pause/Stop are
// visual stubs for now (paused/stopped jobs aren't a thing yet on the
// backend).
export function RunControls({ onRun }: { onRun: () => void }) {
  const t = useTranslations("editor.runControls");
  const isRunning = useEditor((s) => s.isRunning);
  const projectId = useEditor((s) => s.projectId);
  const fileId = useEditor((s) => s.fileId);
  const ready = !!projectId && !!fileId;

  return (
    <div className="flex items-center gap-1">
      <ControlButton
        icon={<Pause className="h-3.5 w-3.5" />}
        label={t("pause")}
        title={t("comingSoon")}
        disabled
        className="text-muted-foreground"
      />
      <ControlButton
        icon={<Square className="h-3.5 w-3.5 fill-current" />}
        label={t("stop")}
        title={t("comingSoon")}
        disabled
        className="text-destructive"
      />
      <ControlButton
        icon={
          isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )
        }
        label={t("play")}
        title={isRunning ? t("running") : t("play")}
        disabled={!ready || isRunning}
        onClick={onRun}
        className="text-emerald-600"
      />
    </div>
  );
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

function ControlButton({
  icon,
  label,
  title,
  disabled,
  onClick,
  className,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={title}
      className={cn(
        "grid size-7 place-items-center rounded-md ring-1 ring-foreground/10 bg-background/60 transition-opacity",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-90",
        className,
      )}
    >
      {icon}
    </button>
  );
}
