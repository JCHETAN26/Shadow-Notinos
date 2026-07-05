"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Failed (${res.status})`);
  return json as T;
}

interface Validation {
  notion: { ok: boolean; error?: string; workspace?: string };
  anthropic: { ok: boolean; error?: string };
}
interface NotionPage {
  id: string;
  title: string;
  url: string;
}
interface SetupResult {
  tenantId: string;
  webhookUrl: string;
  webhookSecret: string;
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 1
  const [notionKey, setNotionKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);

  // step 2
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // step 3
  const [tenantName, setTenantName] = useState("");
  const [repo, setRepo] = useState("");
  const [releaseBranch, setReleaseBranch] = useState("main");
  const [triggerPaths, setTriggerPaths] = useState("");

  // step 4
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [indexed, setIndexed] = useState<Array<{ title: string; chunks: number }>>([]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const validate = () =>
    run(async () => {
      const v = await post<Validation>("/api/onboarding/validate", {
        notionApiKey: notionKey,
        anthropicApiKey: anthropicKey,
      });
      setValidation(v);
      if (v.notion.ok && v.anthropic.ok) {
        const { pages } = await post<{ pages: NotionPage[] }>("/api/onboarding/pages", {
          notionApiKey: notionKey,
        });
        setPages(pages);
        setStep(2);
      }
    });

  const toStep3 = () => {
    if (selected.size === 0) {
      setError("Pick at least one page to keep fresh.");
      return;
    }
    setError(null);
    setStep(3);
  };

  const finish = () =>
    run(async () => {
      const s = await post<SetupResult>("/api/onboarding/setup", {
        tenantName,
        notionApiKey: notionKey,
        anthropicApiKey: anthropicKey,
        githubToken: githubToken || undefined,
        releaseBranch,
        docTriggerPaths: triggerPaths || undefined,
        repoFullName: repo,
      });
      setSetup(s);
      const chosen = pages.filter((p) => selected.has(p.id)).map((p) => ({ id: p.id, title: p.title }));
      const { indexed } = await post<{ indexed: Array<{ title: string; chunks: number }> }>(
        "/api/onboarding/index",
        { tenantId: s.tenantId, pages: chosen },
      );
      setIndexed(indexed);
      setStep(4);
    });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Connect Shadow Notino</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bring your own keys. We keep your Notion docs fresh after every merge — you approve every change.
      </p>

      <Stepper step={step} />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1 — keys */}
      {step === 1 && (
        <Section title="1. Your keys">
          <Field label="Notion integration token" hint="Create at notion.so/my-integrations, then share your doc pages with it.">
            <input type="password" value={notionKey} onChange={(e) => setNotionKey(e.target.value)}
              placeholder="ntn_…" className={inputCls} />
          </Field>
          <Field label="Anthropic API key" hint="console.anthropic.com">
            <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-…" className={inputCls} />
          </Field>
          <Field label="GitHub token (optional)" hint="Only needed for private repos — read-only.">
            <input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
              placeholder="github_pat_…" className={inputCls} />
          </Field>
          {validation && (
            <div className="text-sm">
              <KeyResult label="Notion" ok={validation.notion.ok} detail={validation.notion.workspace ?? validation.notion.error} />
              <KeyResult label="Anthropic" ok={validation.anthropic.ok} detail={validation.anthropic.error} />
            </div>
          )}
          <button onClick={validate} disabled={busy || !notionKey || !anthropicKey} className={primaryBtn}>
            {busy ? "Validating…" : "Validate & continue"}
          </button>
        </Section>
      )}

      {/* Step 2 — pick pages */}
      {step === 2 && (
        <Section title="2. Which docs should stay fresh?">
          <p className="text-sm text-muted-foreground">
            {pages.length} page(s) shared with your integration. Pick the ones the agent should keep up to date.
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {pages.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                <input type="checkbox" checked={selected.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    e.target.checked ? next.add(p.id) : next.delete(p.id);
                    setSelected(next);
                  }} />
                <span className="text-sm">{p.title}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className={secondaryBtn}>Back</button>
            <button onClick={toStep3} className={primaryBtn}>Continue ({selected.size} selected)</button>
          </div>
        </Section>
      )}

      {/* Step 3 — connect repo */}
      {step === 3 && (
        <Section title="3. Connect your repo">
          <Field label="Workspace / team name"><input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Acme Eng" className={inputCls} /></Field>
          <Field label="GitHub repo" hint="owner/repo"><input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="acme/search-service" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Release branch"><input value={releaseBranch} onChange={(e) => setReleaseBranch(e.target.value)} className={inputCls} /></Field>
            <Field label="Trigger paths (optional)" hint="globs, comma-sep"><input value={triggerPaths} onChange={(e) => setTriggerPaths(e.target.value)} placeholder="src/**,apps/**" className={inputCls} /></Field>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className={secondaryBtn}>Back</button>
            <button onClick={finish} disabled={busy || !tenantName || !repo} className={primaryBtn}>
              {busy ? "Setting up & indexing…" : "Create & index"}
            </button>
          </div>
        </Section>
      )}

      {/* Step 4 — done */}
      {step === 4 && setup && (
        <Section title="4. Add the webhook — you're live">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Indexed {indexed.length} page(s): {indexed.map((i) => `${i.title} (${i.chunks})`).join(", ")}.
          </div>
          <p className="text-sm">
            Add a webhook to <span className="font-mono">{repo}</span> → <span className="font-medium">Settings → Webhooks → Add webhook</span>:
          </p>
          <CopyRow label="Payload URL" value={setup.webhookUrl} />
          <CopyRow label="Secret" value={setup.webhookSecret} />
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>Content type: <span className="font-mono">application/json</span></li>
            <li>Events: “Let me select individual events” → <span className="font-medium">Pull requests</span></li>
          </ul>
          <p className="text-sm">Then merge a PR — the run shows up here for your approval:</p>
          <Link href="/runs" className={primaryBtn + " inline-block text-center no-underline"}>Go to runs →</Link>
        </Section>
      )}
    </main>
  );
}

const inputCls = "w-full rounded-md border px-3 py-2 text-sm font-mono";
const primaryBtn = "rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50";
const secondaryBtn = "rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 space-y-4 rounded-xl border p-6">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
function KeyResult({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className={ok ? "text-green-700" : "text-red-700"}>
      {ok ? "✓" : "✗"} {label}
      {detail ? <span className="text-muted-foreground"> — {detail}</span> : null}
    </div>
  );
}
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-xs">{value}</div>
      </div>
      <button onClick={() => navigator.clipboard?.writeText(value)} className={secondaryBtn}>Copy</button>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Keys", "Pages", "Repo", "Done"];
  return (
    <div className="mt-6 flex gap-2">
      {labels.map((l, i) => (
        <div key={l} className={`flex-1 rounded-full px-3 py-1 text-center text-xs font-medium ${
          i + 1 <= step ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
        }`}>
          {i + 1}. {l}
        </div>
      ))}
    </div>
  );
}
