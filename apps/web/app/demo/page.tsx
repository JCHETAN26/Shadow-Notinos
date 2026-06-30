"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { STATUS_META, type AgentRunStatus } from "@/lib/types";

type StepState = "idle" | "running" | "done" | "error";

interface RunPoll {
  id: string;
  status: AgentRunStatus;
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Failed (${res.status})`);
  return body as T;
}

export default function DemoPage() {
  const [verify, setVerify] = useState<{ s: StepState; msg: string }>({ s: "idle", msg: "" });
  const [index, setIndex] = useState<{ s: StepState; msg: string }>({ s: "idle", msg: "" });
  const [replay, setReplay] = useState<{ s: StepState; msg: string }>({ s: "idle", msg: "" });
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunPoll | null>(null);

  // Poll the run while the agent works through the pipeline.
  useEffect(() => {
    if (!runId) return;
    const terminal: AgentRunStatus[] = ["waiting_approval", "applied", "rejected", "failed"];
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/runs/${runId}`);
        const { run: r } = (await res.json()) as { run: RunPoll };
        setRun({ id: r.id, status: r.status });
        if (terminal.includes(r.status)) clearInterval(t);
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [runId]);

  const run1 = async () => {
    setVerify({ s: "running", msg: "" });
    try {
      const r = await post<{ ok: boolean; issues: { db: string; problem: string }[] }>("/api/demo/verify");
      setVerify(
        r.ok
          ? { s: "done", msg: "All databases present." }
          : { s: "error", msg: r.issues.map((i) => `${i.db}: ${i.problem}`).join(" · ") },
      );
    } catch (e) {
      setVerify({ s: "error", msg: (e as Error).message });
    }
  };

  const run2 = async () => {
    setIndex({ s: "running", msg: "" });
    try {
      const r = await post<{ pages: number; chunks: number }>("/api/demo/index");
      setIndex({ s: "done", msg: `Indexed ${r.pages} page(s), ${r.chunks} chunk(s).` });
    } catch (e) {
      setIndex({ s: "error", msg: (e as Error).message });
    }
  };

  const run3 = async () => {
    setReplay({ s: "running", msg: "" });
    setRun(null);
    try {
      const r = await post<{ runId: string }>("/api/demo/replay-github-event");
      setRunId(r.runId);
      setReplay({ s: "done", msg: "Merged PR #184 replayed — agent is working…" });
    } catch (e) {
      setReplay({ s: "error", msg: (e as Error).message });
    }
  };

  const reset = async () => {
    await post("/api/demo/reset").catch(() => {});
    setRunId(null);
    setRun(null);
    setReplay({ s: "idle", msg: "" });
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-muted-foreground hover:text-foreground">
          shadow·notino
        </Link>
        <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">
          Reset demo
        </button>
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Guided demo</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Watch a merged PR turn into a reviewed Notion documentation update. Needs a seeded Notion
        workspace (<code className="font-mono">pnpm notion:seed</code>) and the API running.
      </p>

      <ol className="mt-8 space-y-3">
        <Step n={1} title="Verify Notion workspace" state={verify.s} msg={verify.msg}>
          <Btn onClick={run1} disabled={verify.s === "running"}>Verify</Btn>
        </Step>

        <Step n={2} title="Index docs into pgvector" state={index.s} msg={index.msg}>
          <Btn onClick={run2} disabled={index.s === "running"}>Index docs</Btn>
        </Step>

        <Step n={3} title="Replay merged PR #184" state={replay.s} msg={replay.msg}>
          <Btn onClick={run3} disabled={replay.s === "running"}>Replay PR</Btn>
        </Step>

        <Step
          n={4}
          title="Agent fetches PR, retrieves docs, proposes a patch"
          state={run ? (run.status === "failed" ? "error" : "running") : "idle"}
          msg={run ? `Status: ${STATUS_META[run.status]?.label ?? run.status}` : ""}
        >
          {runId && (
            <Link
              href={`/runs/${runId}`}
              className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Open run to approve →
            </Link>
          )}
        </Step>
      </ol>

      <p className="mt-8 text-xs text-muted-foreground">
        Step 5 — approve the patch on the run page; the writer applies real blocks to your Notion
        page, and the run is logged end to end.
      </p>
    </main>
  );
}

function Btn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

const DOT: Record<StepState, string> = {
  idle: "bg-muted-foreground/30",
  running: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  error: "bg-red-500",
};

function Step({
  n,
  title,
  state,
  msg,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  msg: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border px-4 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")} </span>
            {title}
          </span>
          {children}
        </div>
        {msg && (
          <p className={`mt-1 text-xs ${state === "error" ? "text-red-600" : "text-muted-foreground"}`}>
            {msg}
          </p>
        )}
      </div>
    </li>
  );
}
