"use client";

import { CheckCircle2, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ExecutionJob, JobStatus } from "@/lib/graph-types";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor";

// Console tab: shows the result of the most recent run for the active
// project. Empty state until the user clicks ▶. When a run is in flight,
// the run controls flip to a spinner and we render a "running" placeholder
// here so the user has somewhere to look while they wait.
export function ConsoleView() {
  const t = useTranslations("editor.console");
  const job = useEditor((s) => s.lastJob);
  const isRunning = useEditor((s) => s.isRunning);

  if (isRunning && !job) {
    return (
      <div className="flex h-full items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("running")}
      </div>
    );
  }

  if (!job) {
    return <p className="italic text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2 text-xs">
        <StatusBadge status={job.status} />
        {job.started_at && job.finished_at && (
          <span className="text-muted-foreground">
            {t("elapsed", { ms: elapsedMs(job) })}
          </span>
        )}
      </header>

      {job.error_message && (
        <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-2 text-destructive">
          {job.error_message}
        </pre>
      )}

      {job.stdout && (
        <section>
          <h4 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("stdout")}
          </h4>
          <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono">
            {job.stdout}
          </pre>
        </section>
      )}

      {job.stderr && (
        <section>
          <h4 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("stderr")}
          </h4>
          <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-destructive">
            {job.stderr}
          </pre>
        </section>
      )}

      {job.artifacts_json.length > 0 && (
        <section>
          <h4 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("artifacts")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {job.artifacts_json.map((a) => (
              <figure key={a.filename} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${a.kind};base64,${a.data_b64}`}
                  alt={a.filename}
                  className="max-h-64 rounded ring-1 ring-foreground/10"
                />
                <figcaption className="text-[10px] text-muted-foreground">
                  {a.filename}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const t = useTranslations("editor.console");
  const map: Record<
    JobStatus,
    { icon: React.ReactNode; label: string; tone: string }
  > = {
    queued: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: t("running"),
      tone: "text-muted-foreground",
    },
    running: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: t("running"),
      tone: "text-muted-foreground",
    },
    succeeded: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: t("exitOk"),
      tone: "text-emerald-600",
    },
    failed: {
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: t("exitFailed"),
      tone: "text-destructive",
    },
    timeout: {
      icon: <TriangleAlert className="h-3.5 w-3.5" />,
      label: t("exitTimeout"),
      tone: "text-amber-600",
    },
    error: {
      icon: <TriangleAlert className="h-3.5 w-3.5" />,
      label: t("exitError"),
      tone: "text-destructive",
    },
  };
  const entry = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", entry.tone)}>
      {entry.icon} {entry.label}
    </span>
  );
}

function elapsedMs(job: ExecutionJob): number {
  if (!job.started_at || !job.finished_at) return 0;
  return new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
}
