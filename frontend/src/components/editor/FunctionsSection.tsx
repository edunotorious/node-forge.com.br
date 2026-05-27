"use client";

import { PencilLine, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { VisibilityGlyph } from "@/components/editor/VisibilityGlyph";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TYPE_COLORS,
  VARIABLE_TYPES,
  type FunctionDef,
  type ReturnType,
} from "@/lib/graph-types";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

const NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RETURN_TYPES: ReturnType[] = [...VARIABLE_TYPES, "None"];

export function FunctionsSection() {
  const t = useTranslations("editor.details");
  const functions = useEditor((s) => s.functions);
  const removeFunction = useEditor((s) => s.removeFunction);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FunctionDef | null>(null);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(f: FunctionDef) {
    setEditing(f);
    setOpen(true);
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("functions")}
      </h3>
      <ul className="space-y-1">
        {functions.length === 0 && (
          <li className="text-xs italic text-muted-foreground">
            {t("emptyFunctions")}
          </li>
        )}
        {functions.map((f) => {
          const colorClass =
            f.return_type === "None"
              ? "bg-zinc-400"
              : TYPE_COLORS[f.return_type];
          return (
            <li key={f.id} className="group flex items-center gap-2 text-xs">
              <VisibilityGlyph name={f.name} colorClass={colorClass} />
              <span className="w-16 shrink-0 text-muted-foreground">
                function
              </span>
              <span className="truncate font-mono">{f.name}</span>
              <span className="truncate text-muted-foreground">
                → {f.return_type}
              </span>
              <div className="ml-auto hidden gap-0.5 group-hover:flex">
                <button
                  type="button"
                  onClick={() => openEdit(f)}
                  aria-label={t("editAria")}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <PencilLine className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFunction(f.id)}
                  aria-label={t("removeAria")}
                  className="p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={openCreate}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addFunction")}
      </button>

      <FunctionDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        existingNames={functions.map((f) => f.name)}
      />
    </section>
  );
}

// Shared between top-level functions and class methods (ClassesSection
// passes its own onSubmit + existingNames). Same key-based remount trick
// as VariableDialog so useState reads fresh initial values from `editing`.
export function FunctionDialog({
  open,
  onOpenChange,
  editing,
  existingNames,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FunctionDef | null;
  existingNames: string[];
  onSubmit?: (def: FunctionDef) => void;
}) {
  const t = useTranslations("editor.functionDialog");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(editing ? "editTitle" : "title")}</DialogTitle>
        </DialogHeader>
        <FunctionForm
          key={editing?.id ?? "new"}
          editing={editing}
          existingNames={existingNames}
          onSubmit={onSubmit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function FunctionForm({
  editing,
  existingNames,
  onSubmit,
  onClose,
}: {
  editing: FunctionDef | null;
  existingNames: string[];
  onSubmit?: (def: FunctionDef) => void;
  onClose: () => void;
}) {
  const t = useTranslations("editor.functionDialog");
  const addFunction = useEditor((s) => s.addFunction);
  const updateFunction = useEditor((s) => s.updateFunction);
  const [name, setName] = useState(editing?.name ?? "");
  const [returnType, setReturnType] = useState<ReturnType>(
    editing?.return_type ?? "None",
  );
  const [body, setBody] = useState(editing?.body ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t("nameRequired"));
    if (!NAME_REGEX.test(trimmed)) return setError(t("nameInvalid"));
    const others = editing
      ? existingNames.filter((n) => n !== editing.name)
      : existingNames;
    if (others.includes(trimmed)) return setError(t("duplicateName"));

    const def: FunctionDef = {
      id: editing?.id ?? "f-" + Math.random().toString(36).slice(2, 10),
      name: trimmed,
      return_type: returnType,
      parameters: editing?.parameters ?? [],
      body,
    };
    if (onSubmit) {
      onSubmit(def);
    } else if (editing) {
      updateFunction(editing.id, def);
    } else {
      addFunction(def);
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="fn-name">{t("name")}</Label>
        <Input
          id="fn-name"
          autoFocus
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="fn-return">{t("returnType")}</Label>
        <select
          id="fn-return"
          value={returnType}
          onChange={(e) => setReturnType(e.target.value as ReturnType)}
          className={cn(
            "h-9 w-full rounded-lg bg-input px-3 text-sm outline-none focus:ring-3 focus:ring-ring/50",
          )}
        >
          {RETURN_TYPES.map((tk) => (
            <option key={tk} value={tk}>
              {tk}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="fn-body">{t("body")}</Label>
        <textarea
          id="fn-body"
          rows={6}
          placeholder={t("bodyPlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full resize-none rounded-lg bg-input px-3 py-2 font-mono text-xs outline-none focus:ring-3 focus:ring-ring/50"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit">{t(editing ? "editSubmit" : "submit")}</Button>
      </DialogFooter>
    </form>
  );
}
