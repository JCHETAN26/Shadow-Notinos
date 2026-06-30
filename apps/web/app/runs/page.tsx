import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import type { RunListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  let runs: RunListItem[] = [];
  let error: string | null = null;
  try {
    const data = await apiFetch<{ runs: RunListItem[] }>("/api/runs");
    runs = data.runs;
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="font-mono text-xs text-muted-foreground hover:text-foreground">
            shadow·notino
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Agent runs</h1>
        </div>
        <Link href="/demo" className="text-sm text-muted-foreground hover:text-foreground">
          Demo →
        </Link>
      </div>

      {error && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load runs: {error}
          <div className="mt-1 text-red-600/80">Is the API running on {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}?</div>
        </div>
      )}

      {!error && runs.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          No runs yet. Replay a merged PR from the <Link href="/demo" className="underline">demo page</Link> to start one.
        </div>
      )}

      {runs.length > 0 && (
        <div className="mt-8 divide-y rounded-lg border">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{run.prTitle}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {run.repo}#{run.prNumber} · {run.author ?? "unknown"}
                </div>
              </div>
              <StatusBadge status={run.status} />
              <div className="w-28 text-right font-mono text-xs text-muted-foreground">
                {new Date(run.createdAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
