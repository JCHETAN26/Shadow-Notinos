import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ActionView } from "@/components/ActionView";
import { ApprovalActions } from "@/components/ApprovalActions";
import type { RunDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let run: RunDetail;
  try {
    const data = await apiFetch<{ run: RunDetail }>(`/api/runs/${id}`);
    run = data.run;
  } catch {
    notFound();
  }

  const plan = run!.patchPlans[0];
  const pr = run!.prContext;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/runs" className="text-sm text-muted-foreground hover:text-foreground">
        ← All runs
      </Link>

      <header className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{run!.prTitle}</h1>
          <a
            href={run!.prUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {run!.repo}#{run!.prNumber} ↗
          </a>
        </div>
        <StatusBadge status={run!.status} />
      </header>

      {/* Impact summary */}
      {run!.impactSummary && (
        <Section title="Impact summary">
          <p className="text-sm leading-relaxed">{run!.impactSummary}</p>
        </Section>
      )}

      {/* PR context */}
      {pr && (
        <Section title="Changed files">
          <div className="space-y-2">
            {pr.filesChanged.map((f) => (
              <div key={f.filename} className="rounded-lg border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                  <span className="font-mono text-xs">{f.filename}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    +{f.additions}/-{f.deletions}
                  </span>
                </div>
                {f.patchExcerpt && (
                  <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed">
                    <code>{f.patchExcerpt}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Related docs */}
      {run!.relatedDocs && run!.relatedDocs.length > 0 && (
        <Section title="Related docs found">
          <ul className="space-y-1 text-sm">
            {run!.relatedDocs.map((d) => (
              <li key={d.pageId} className="flex items-center justify-between">
                <span>{d.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{d.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Proposed actions */}
      {plan ? (
        <Section title={`Proposed changes → ${plan.patchJson.targetPageTitle}`}>
          <div className="space-y-3">
            {plan.patchJson.actions.map((a, i) => (
              <ActionView key={i} action={a} />
            ))}
          </div>

          {plan.patchJson.risks.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-medium text-amber-800">Risks</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                {plan.patchJson.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            {plan.status === "proposed" ? (
              <ApprovalActions runId={run!.id} />
            ) : (
              <p className="text-sm text-muted-foreground">
                This patch is <span className="font-medium">{plan.status}</span>.
              </p>
            )}
          </div>
        </Section>
      ) : (
        <Section title="Proposed changes">
          <p className="text-sm text-muted-foreground">
            No patch plan yet — the agent is still working, or the run failed. See the timeline below.
          </p>
        </Section>
      )}

      {/* Timeline */}
      <Section title="Timeline">
        <ol className="space-y-2">
          {run!.events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleTimeString()} · {e.type}
              </span>
              <span className="text-muted-foreground">{e.message}</span>
            </li>
          ))}
        </ol>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
