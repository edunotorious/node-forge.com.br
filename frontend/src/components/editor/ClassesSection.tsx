"use client";

import { ChevronDown, ChevronRight, PencilLine, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FunctionDialog } from "@/components/editor/FunctionsSection";
import { VariableDialog } from "@/components/editor/VariablesSection";
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
  type ClassDef,
  type FunctionDef,
  type VariableDef,
} from "@/lib/graph-types";
import { useEditor } from "@/stores/editor";

const NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

// "Classes" tab content. Each class is collapsible — when expanded it
// shows three nested sub-sections (decorators, variables, methods) with
// their own Add buttons + inline edit. v1 doesn't distinguish instance vs
// class variables. The shape matches the codegen template in
// backend/src/runner/codegen.py.
export function ClassesSection() {
  const t = useTranslations("editor");
  const tClasses = useTranslations("editor.classes");
  const classes = useEditor((s) => s.classes);
  const removeClass = useEditor((s) => s.removeClass);
  const [newOpen, setNewOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (classes.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs italic text-muted-foreground">
          {t("classesPlaceholder")}
        </p>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> {tClasses("addClass")}
        </button>
        <NewClassDialog open={newOpen} onOpenChange={setNewOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {classes.map((c) => (
        <ClassCard
          key={c.id}
          klass={c}
          expanded={!!expanded[c.id]}
          onToggle={() =>
            setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))
          }
          onRemove={() => removeClass(c.id)}
        />
      ))}
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {tClasses("addClass")}
      </button>
      <NewClassDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function ClassCard({
  klass,
  expanded,
  onToggle,
  onRemove,
}: {
  klass: ClassDef;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("editor.classes");
  const updateClass = useEditor((s) => s.updateClass);

  function addDecorator(name: string) {
    if (klass.decorators.includes(name)) return;
    updateClass(klass.id, { decorators: [...klass.decorators, name] });
  }
  function removeDecorator(name: string) {
    updateClass(klass.id, {
      decorators: klass.decorators.filter((d) => d !== name),
    });
  }
  function upsertVariable(v: VariableDef) {
    const existing = klass.variables.findIndex((x) => x.id === v.id);
    const next =
      existing >= 0
        ? klass.variables.map((x) => (x.id === v.id ? v : x))
        : [...klass.variables, v];
    updateClass(klass.id, { variables: next });
  }
  function removeVariable(id: string) {
    updateClass(klass.id, {
      variables: klass.variables.filter((v) => v.id !== id),
    });
  }
  function upsertMethod(m: FunctionDef) {
    const existing = klass.methods.findIndex((x) => x.id === m.id);
    const next =
      existing >= 0
        ? klass.methods.map((x) => (x.id === m.id ? m : x))
        : [...klass.methods, m];
    updateClass(klass.id, { methods: next });
  }
  function removeMethod(id: string) {
    updateClass(klass.id, {
      methods: klass.methods.filter((f) => f.id !== id),
    });
  }

  return (
    <div className="rounded border bg-background/50">
      <div className="group flex items-center gap-1 px-2 py-1.5 text-xs">
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? t("collapseAria") : t("expandAria")}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="font-mono font-semibold">{klass.name}</span>
        {klass.parent_class && (
          <span className="truncate text-muted-foreground">
            ({klass.parent_class})
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeAria")}
          className="ml-auto hidden p-0.5 text-muted-foreground hover:text-destructive group-hover:inline-flex"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {expanded && (
        <div className="space-y-3 border-t px-2 py-2 text-xs">
          <DecoratorsBlock
            decorators={klass.decorators}
            onAdd={addDecorator}
            onRemove={removeDecorator}
          />
          <ClassVariablesBlock
            variables={klass.variables}
            onUpsert={upsertVariable}
            onRemove={removeVariable}
          />
          <ClassMethodsBlock
            methods={klass.methods}
            onUpsert={upsertMethod}
            onRemove={removeMethod}
          />
        </div>
      )}
    </div>
  );
}

function DecoratorsBlock({
  decorators,
  onAdd,
  onRemove,
}: {
  decorators: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const t = useTranslations("editor.classes");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t("errors.nameRequired"));
    if (!NAME_REGEX.test(trimmed)) return setError(t("errors.nameInvalid"));
    if (decorators.includes(trimmed)) {
      return setError(t("errors.duplicateDecorator"));
    }
    onAdd(trimmed);
    setName("");
    setError(null);
    setOpen(false);
  }

  return (
    <section>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("decoratorsLabel")}
      </h4>
      <ul className="space-y-0.5">
        {decorators.map((d) => (
          <li key={d} className="group flex items-center gap-1 font-mono">
            <span>@{d}</span>
            <button
              type="button"
              onClick={() => onRemove(d)}
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
        className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addDecorator")}
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setName("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newDecoratorTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="dec-name">{t("newDecoratorName")}</Label>
              <Input
                id="dec-name"
                autoFocus
                placeholder={t("newDecoratorPlaceholder")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit">{t("newDecoratorSubmit")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ClassVariablesBlock({
  variables,
  onUpsert,
  onRemove,
}: {
  variables: VariableDef[];
  onUpsert: (v: VariableDef) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("editor.classes");
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
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("variablesLabel")}
      </h4>
      <ul className="space-y-0.5">
        {variables.map((v) => (
          <li key={v.id} className="group flex items-center gap-2 font-mono">
            <VisibilityGlyph name={v.name} colorClass={TYPE_COLORS[v.type]} />
            <span className="w-10 shrink-0 text-muted-foreground">{v.type}</span>
            <span className="truncate">{v.name}</span>
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
                onClick={() => onRemove(v.id)}
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
        className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addVariable")}
      </button>
      <VariableDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        existingNames={variables.map((v) => v.name)}
        onSubmit={onUpsert}
      />
    </section>
  );
}

function ClassMethodsBlock({
  methods,
  onUpsert,
  onRemove,
}: {
  methods: FunctionDef[];
  onUpsert: (f: FunctionDef) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("editor.classes");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FunctionDef | null>(null);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(m: FunctionDef) {
    setEditing(m);
    setOpen(true);
  }

  return (
    <section>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("methodsLabel")}
      </h4>
      <ul className="space-y-0.5">
        {methods.map((m) => (
          <li key={m.id} className="group flex items-center gap-2 font-mono">
            <span className="truncate">{m.name}(self)</span>
            <span className="truncate text-muted-foreground">
              → {m.return_type}
            </span>
            <div className="ml-auto hidden gap-0.5 group-hover:flex">
              <button
                type="button"
                onClick={() => openEdit(m)}
                aria-label={t("editAria")}
                className="p-0.5 text-muted-foreground hover:text-foreground"
              >
                <PencilLine className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(m.id)}
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
        className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> {t("addMethod")}
      </button>
      <FunctionDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        existingNames={methods.map((m) => m.name)}
        onSubmit={onUpsert}
      />
    </section>
  );
}

function NewClassDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("editor.classes");
  const classes = useEditor((s) => s.classes);
  const addClass = useEditor((s) => s.addClass);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setParent("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t("errors.nameRequired"));
    if (!NAME_REGEX.test(trimmed)) return setError(t("errors.nameInvalid"));
    if (classes.some((c) => c.name === trimmed)) {
      return setError(t("errors.duplicateName"));
    }
    addClass({
      id: "c-" + Math.random().toString(36).slice(2, 10),
      name: trimmed,
      parent_class: parent.trim(),
      decorators: [],
      variables: [],
      methods: [],
    });
    reset();
    onOpenChange(false);
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
          <DialogTitle>{t("newClassTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cls-name">{t("newClassName")}</Label>
            <Input
              id="cls-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cls-parent">{t("newClassParent")}</Label>
            <Input
              id="cls-parent"
              placeholder={t("newClassParentPlaceholder")}
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit">{t("newClassSubmit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
