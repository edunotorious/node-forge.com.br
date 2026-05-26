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
  type FunctionDef,
  type ReturnType,
} from "@/lib/graph-types";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

const NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RETURN_TYPES: ReturnType[] = [...VARIABLE_TYPES, "None"];

// Functions are stored alongside variables in the per-file graph_json. v1
// supports only name + return type + body; full signature editing
// (parameters, decorators, generics) will come with the broader function-
// node integration in a later phase.
export function FunctionsSection() {
  const t = useTranslations("editor.details");
  const functions = useEditor((s) => s.functions);
  const removeFunction = useEditor((s) => s.removeFunction);
  const [open, setOpen] = useState(false);

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
              <button
                type="button"
                onClick={() => removeFunction(f.id)}
                aria-label={t("removeAria")}
                className="ml-auto hidden p-0.5 text-muted-foreground hover:text-destructive group-hover:inline-flex"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addFunction")}
      </button>

      <NewFunctionDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}

function NewFunctionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("editor.functionDialog");
  const functions = useEditor((s) => s.functions);
  const addFunction = useEditor((s) => s.addFunction);
  const [name, setName] = useState("");
  const [returnType, setReturnType] = useState<ReturnType>("None");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setReturnType("None");
    setBody("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("nameRequired"));
    if (!NAME_REGEX.test(name.trim())) return setError(t("nameInvalid"));
    if (functions.some((f) => f.name === name.trim())) {
      return setError(t("duplicateName"));
    }
    const def: FunctionDef = {
      id: "f-" + Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      return_type: returnType,
      parameters: [],
      body: body,
    };
    addFunction(def);
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
            <Button type="submit">{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
