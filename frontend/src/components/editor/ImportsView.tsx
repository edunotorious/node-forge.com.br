"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { NODE_IMPORTS, PYTHON_PACKAGES } from "@/lib/imports-catalog";
import { cn } from "@/lib/utils";

// Two-column Imports panel. Left half: Node Imports — a list of node packages
// (Fundamentals, Quantum, …) and the categorized contents of the selected
// package. Right half: Python Packages installed in the executor sandbox.
// v1 reads from a static catalog (lib/imports-catalog.ts); a real installed-
// packages source comes online with the executor.
export function ImportsView() {
  const t = useTranslations("editor.imports");
  return (
    <div className="grid h-full grid-cols-2 gap-4 text-xs">
      <NodeImportsColumn title={t("nodeImports")} />
      <PythonPackagesColumn title={t("pythonPackages")} />
    </div>
  );
}

function NodeImportsColumn({ title }: { title: string }) {
  const t = useTranslations("editor.imports");
  const [selectedId, setSelectedId] = useState(NODE_IMPORTS[0]?.id);
  const selected = NODE_IMPORTS.find((p) => p.id === selectedId);

  return (
    <section className="flex flex-col rounded-md ring-1 ring-foreground/10 bg-card/40">
      <h3 className="border-b px-3 py-2 font-heading text-sm font-bold">
        {title}
      </h3>
      <div className="grid flex-1 grid-cols-[8rem_1fr_1fr] divide-x">
        <ul className="overflow-y-auto py-1">
          {NODE_IMPORTS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "block w-full truncate px-2 py-1 text-left transition-colors",
                  p.id === selectedId
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <ul className="overflow-y-auto py-1 font-mono text-[11px]">
          {selected?.categories.map((cat) => (
            <li key={cat.name} className="px-2 py-1">
              <div className="font-medium text-foreground">{cat.name}</div>
              <ul className="ml-3 mt-0.5 list-disc text-muted-foreground">
                {cat.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="space-y-1 overflow-y-auto p-2">
          {selected && (
            <>
              <p>
                <span className="text-muted-foreground">{t("author")}</span>{" "}
                {selected.author}
              </p>
              <p>
                <span className="text-muted-foreground">{t("description")}</span>
                <br />
                {selected.description}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function PythonPackagesColumn({ title }: { title: string }) {
  const t = useTranslations("editor.imports");
  const [selectedId, setSelectedId] = useState(PYTHON_PACKAGES[0]?.id);
  const selected = PYTHON_PACKAGES.find((p) => p.id === selectedId);

  return (
    <section className="flex flex-col rounded-md ring-1 ring-foreground/10 bg-card/40">
      <h3 className="border-b px-3 py-2 font-heading text-sm font-bold">
        {title}
      </h3>
      <div className="grid flex-1 grid-cols-[10rem_1fr] divide-x">
        <ul className="overflow-y-auto py-1">
          {PYTHON_PACKAGES.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "block w-full truncate px-2 py-1 text-left font-mono transition-colors",
                  p.id === selectedId
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-1 overflow-y-auto p-2">
          {selected && (
            <>
              <p>
                <span className="text-muted-foreground">{t("author")}</span>{" "}
                {selected.author}
              </p>
              <p>
                <span className="text-muted-foreground">{t("version")}</span>{" "}
                <span className="font-mono">{selected.version}</span>
              </p>
              <p>
                <span className="text-muted-foreground">{t("description")}</span>
                <br />
                {selected.description}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
