"use client";

import { ArrowLeft, Loader2, Play, Save } from "lucide-react";
import Link from "next/link";

import { useEditor, type SaveStatus } from "@/stores/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StatusLabel({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
}) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-xs text-destructive">Erro ao salvar</span>;
  }
  if (status === "saved" && lastSavedAt) {
    const time = lastSavedAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <span className="text-xs text-muted-foreground">Salvo às {time}</span>
    );
  }
  if (status === "dirty") {
    return <span className="text-xs text-muted-foreground">Mudanças não salvas</span>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

export function EditorTopBar({
  onSaveNow,
}: {
  onSaveNow: () => void;
}) {
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const saveStatus = useEditor((s) => s.saveStatus);
  const lastSavedAt = useEditor((s) => s.lastSavedAt);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3">
      <Button asChild variant="ghost" size="sm">
        <Link href="/projects" aria-label="Voltar para projetos">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <Input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        placeholder="Nome do projeto"
        className="h-8 max-w-sm"
      />
      <StatusLabel status={saveStatus} lastSavedAt={lastSavedAt} />
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveNow}
          disabled={saveStatus === "saving"}
        >
          <Save className="mr-1 h-4 w-4" /> Salvar
        </Button>
        <Button
          size="sm"
          disabled
          title="Disponível na Phase 7"
        >
          <Play className="mr-1 h-4 w-4" /> Run
        </Button>
      </div>
    </header>
  );
}
