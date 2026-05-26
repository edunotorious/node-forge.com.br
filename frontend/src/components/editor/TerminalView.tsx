"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

// Visual-only terminal for now. Wiring this to the executor (Phase 7) means
// piping stdout/stderr line-by-line over WS and sending input lines back.
// For v1 we accept input, echo it as a fake command line, and prepend a
// banner explaining the situation so users don't think it's broken.
export function TerminalView() {
  const t = useTranslations("editor.terminal");
  const [history, setHistory] = useState<string[]>([]);
  const [input, setInput] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    setHistory((h) => [...h, cmd]);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col font-mono">
      <p className="mb-2 rounded bg-muted/40 px-2 py-1 text-[11px] italic text-muted-foreground">
        {t("banner")}
      </p>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {history.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground">{t("prompt")}</span>
            <span>{line}</span>
          </div>
        ))}
        <form onSubmit={onSubmit} className="flex gap-2">
          <span className="text-muted-foreground">{t("prompt")}</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label={t("inputAria")}
            className="flex-1 bg-transparent text-foreground outline-none"
          />
        </form>
      </div>
    </div>
  );
}
