"use client";

import { Plus, X } from "lucide-react";
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
            <button
              type="button"
              onClick={() => removeVariable(v.id)}
              aria-label={t("removeAria")}
              className="ml-auto hidden p-0.5 text-muted-foreground hover:text-destructive group-hover:inline-flex"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addVariable")}
      </button>

      <NewVariableDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}

function NewVariableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("editor.variableDialog");
  const variables = useEditor((s) => s.variables);
  const addVariable = useEditor((s) => s.addVariable);
  const [name, setName] = useState("");
  const [type, setType] = useState<VariableType>("Int");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setType("Int");
    setValue("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("nameRequired"));
    if (!NAME_REGEX.test(name.trim())) return setError(t("nameInvalid"));
    if (variables.some((v) => v.name === name.trim())) {
      return setError(t("duplicateName"));
    }
    const def: VariableDef = {
      id: "v-" + Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      type,
      value: value.trim(),
    };
    addVariable(def);
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
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
            <Button type="submit">{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
