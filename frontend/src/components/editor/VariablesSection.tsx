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
  type VariableDef,
  type VariableType,
} from "@/lib/graph-types";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

const NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function VariablesSection() {
  const t = useTranslations("editor.details");
  const variables = useEditor((s) => s.variables);
  const removeVariable = useEditor((s) => s.removeVariable);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VariableDef | null>(null);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(v: VariableDef) {
    setEditing(v);
    setOpen(true);
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("variables")}
      </h3>
      <ul className="space-y-1">
        {variables.length === 0 && (
          <li className="text-xs italic text-muted-foreground">
            {t("emptyVariables")}
          </li>
        )}
        {variables.map((v) => (
          <li key={v.id} className="group flex items-center gap-2 text-xs">
            <VisibilityGlyph name={v.name} colorClass={TYPE_COLORS[v.type]} />
            <span className="w-12 shrink-0 text-muted-foreground">
              {v.type}
            </span>
            <span className="truncate font-mono">{v.name}</span>
            {v.value && (
              <span className="truncate text-muted-foreground">= {v.value}</span>
            )}
            <div className="ml-auto hidden gap-0.5 group-hover:flex">
              <button
                type="button"
                onClick={() => openEdit(v)}
                aria-label={t("editAria")}
                className="p-0.5 text-muted-foreground hover:text-foreground"
              >
                <PencilLine className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => removeVariable(v.id)}
                aria-label={t("removeAria")}
                className="p-0.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={openCreate}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addVariable")}
      </button>

      <VariableDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        existingNames={variables.map((v) => v.name)}
      />
    </section>
  );
}

// Shared dialog used in create AND edit mode. Mode is inferred from
// `editing`: null → create, otherwise → edit the matching row. Exported so
// ClassesSection's variables-block can reuse it without duplicating the
// form code.
//
// The form is split into an inner component with a key={editing?.id ?? "new"}
// so React remounts it on mode change — that lets useState read fresh
// initial values from `editing` without needing a useEffect to sync (which
// the new react-hooks/set-state-in-effect rule rightly flags).
export function VariableDialog({
  open,
  onOpenChange,
  editing,
  existingNames,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: VariableDef | null;
  existingNames: string[];
  // Custom submit handler — used by class variables which live inside a
  // ClassDef instead of the top-level store. If omitted, defaults to the
  // top-level add/updateVariable store actions.
  onSubmit?: (def: VariableDef) => void;
}) {
  const t = useTranslations("editor.variableDialog");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(editing ? "editTitle" : "title")}</DialogTitle>
        </DialogHeader>
        <VariableForm
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

function VariableForm({
  editing,
  existingNames,
  onSubmit,
  onClose,
}: {
  editing: VariableDef | null;
  existingNames: string[];
  onSubmit?: (def: VariableDef) => void;
  onClose: () => void;
}) {
  const t = useTranslations("editor.variableDialog");
  const addVariable = useEditor((s) => s.addVariable);
  const updateVariable = useEditor((s) => s.updateVariable);
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<VariableType>(editing?.type ?? "Int");
  const [value, setValue] = useState(editing?.value ?? "");
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

    const def: VariableDef = {
      id: editing?.id ?? "v-" + Math.random().toString(36).slice(2, 10),
      name: trimmed,
      type,
      value: value.trim(),
    };
    if (onSubmit) {
      onSubmit(def);
    } else if (editing) {
      updateVariable(editing.id, def);
    } else {
      addVariable(def);
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="var-name">{t("name")}</Label>
        <Input
          id="var-name"
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
        <Label htmlFor="var-type">{t("type")}</Label>
        <select
          id="var-type"
          value={type}
          onChange={(e) => setType(e.target.value as VariableType)}
          className={cn(
            "h-9 w-full rounded-lg bg-input px-3 text-sm outline-none focus:ring-3 focus:ring-ring/50",
          )}
        >
          {VARIABLE_TYPES.map((tk) => (
            <option key={tk} value={tk}>
              {tk}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="var-value">{t("value")}</Label>
        <Input
          id="var-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit">{t(editing ? "editSubmit" : "submit")}</Button>
      </DialogFooter>
    </form>
  );
}
