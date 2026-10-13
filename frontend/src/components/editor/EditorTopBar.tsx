"use client";

import { ArrowLeft, Loader2, Save, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PublishToVaultDialog } from "@/components/vault/publish-dialog";
import { useEditor, type SaveStatus } from "@/stores/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";

function StatusLabel({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
}) {
  const t = useTranslations("editor.status");
  const locale = useLocale();

  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {t("saving")}
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-xs text-destructive">{t("saveError")}</span>;
  }
  if (status === "saved" && lastSavedAt) {
    const time = lastSavedAt.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <span className="text-xs text-muted-foreground">
        {t("savedAt", { time })}
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="text-xs text-muted-foreground">{t("unsaved")}</span>
    );
  }
  return <span className="text-xs text-muted-foreground">{t("idle")}</span>;
}

export function EditorTopBar({
  onSaveNow,
  flushSave,
}: {
  onSaveNow: () => void;
  flushSave: () => Promise<void>;
}) {
  const t = useTranslations("editor");
  const projectId = useEditor((s) => s.projectId);
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const saveStatus = useEditor((s) => s.saveStatus);
  const lastSavedAt = useEditor((s) => s.lastSavedAt);
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3">
      <Button asChild variant="ghost" size="sm">
        <Link href="/projects" aria-label={t("backToProjects")}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <Input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        placeholder={t("projectNamePlaceholder")}
        className="h-8 max-w-sm"
      />
      <StatusLabel status={saveStatus} lastSavedAt={lastSavedAt} />
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPublishOpen(true)}
          disabled={!projectId || saveStatus === "saving"}
        >
          <Upload className="mr-1 h-4 w-4" /> {t("publishToVault")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveNow}
          disabled={saveStatus === "saving"}
        >
          <Save className="mr-1 h-4 w-4" /> {t("save")}
        </Button>
      </div>
      {projectId ? (
        <PublishToVaultDialog
          projectId={projectId}
          projectName={projectName}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          beforePublish={flushSave}
        />
      ) : null}
    </header>
  );
}
