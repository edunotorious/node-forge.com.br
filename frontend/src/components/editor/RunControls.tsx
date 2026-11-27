"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

// Run controls. Play saves and runs the active file; Stop kills the run in
// flight (POST /jobs/:id/cancel). There is no Pause: a sandboxed script
// cannot be resumed meaningfully and the disabled stub only confused users.
export function RunControls({
  onRun,
  onStop,
}: {
  onRun: () => void;
  onStop: () => void;
}) {
  const t = useTranslations("editor.runControls");
  const isRunning = useEditor((s) => s.isRunning);
  const isStopping = useEditor((s) => s.isStopping);
  const projectId = useEditor((s) => s.projectId);
  const fileId = useEditor((s) => s.fileId);
  const ready = !!projectId && !!fileId;

  return (
    <div className="flex items-center gap-1">
      <ControlButton
        icon={
          isStopping ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5 fill-current" />
          )
        }
        label={t("stop")}
        title={isRunning ? t("stop") : t("stopIdle")}
        disabled={!isRunning || isStopping}
        onClick={onStop}
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
