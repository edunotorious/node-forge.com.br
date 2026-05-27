"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useEditor } from "@/stores/editor";

// One entry in the visible scrollback. The prompt is rendered with the
// command; stdout/stderr come back from the executor and are stored
// raw — TerminalView renders them as <pre> so newlines / indentation
// land where Python put them.
interface TerminalEntry {
  command: string;
  stdout: string;
  stderr: string;
}

interface TerminalResponse {
  stdout: string;
  stderr: string;
  status: string;
}

// Python REPL backed by the executor. Each new command sends the FULL
// history along — the sandbox is fresh per call, so the wrapper script on
// the backend replays history silently before running the new line. State
// lives only in the client; closing the tab drops it.
export function TerminalView() {
  const t = useTranslations("editor.terminal");
  const projectId = useEditor((s) => s.projectId);
  const fileId = useEditor((s) => s.fileId);
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom whenever new output lands or the user types.
  // Using scrollTop = scrollHeight is enough — no smooth behaviour because
  // the scrollback flickers if we animate during fast turns.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, running]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd || running || !projectId || !fileId) return;
    setRunning(true);
    setInput("");
    const history = entries.map((e) => e.command);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/files/${fileId}/terminal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, command: cmd }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const payload: TerminalResponse = await res.json();
      setEntries((prev) => [
        ...prev,
        { command: cmd, stdout: payload.stdout, stderr: payload.stderr },
      ]);
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        { command: cmd, stdout: "", stderr: (err as Error).message },
      ]);
    } finally {
      setRunning(false);
    }
  }

  function onClear() {
    setEntries([]);
  }

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 rounded bg-muted/40 px-2 py-1 text-[11px] italic text-muted-foreground">
          {t("banner")}
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          aria-label={t("clearAria")}
          title={t("clear")}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto">
        {entries.map((e, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex gap-2">
              <span className="text-muted-foreground">{t("prompt")}</span>
              <pre className="flex-1 whitespace-pre-wrap break-words">
                {e.command}
              </pre>
            </div>
            {e.stdout && (
              <pre className="whitespace-pre-wrap break-words pl-3">
                {e.stdout}
              </pre>
            )}
            {e.stderr && (
              <pre className="whitespace-pre-wrap break-words pl-3 text-destructive">
                {e.stderr}
              </pre>
            )}
          </div>
        ))}
        <form onSubmit={onSubmit} className="flex gap-2">
          <span className="text-muted-foreground">{t("prompt")}</span>
          {running ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("running")}
            </span>
          ) : (
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label={t("inputAria")}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-foreground outline-none"
            />
          )}
        </form>
      </div>
    </div>
  );
}
