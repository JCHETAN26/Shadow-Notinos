import Link from "next/link";

const flow = [
  { step: "PR merged", detail: "GitHub webhook fires" },
  { step: "Agent runs", detail: "Fetch diff, retrieve related Notion docs" },
  { step: "Patch proposed", detail: "Structured, Zod-validated plan" },
  { step: "Human approves", detail: "Inspect, edit, or reject" },
  { step: "Notion updated", detail: "Real block writes + audit log" },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-20">
      <header className="flex items-center justify-between">
        <span className="font-mono text-sm tracking-tight text-muted-foreground">
          shadow·notino
        </span>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <Link href="/runs" className="hover:text-foreground">
            Runs
          </Link>
          <Link href="/demo" className="hover:text-foreground">
            Demo
          </Link>
        </nav>
      </header>

      <section className="mt-24">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          A technical writer agent inside your Notion workspace
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
          Keep your engineering docs fresh after every merged pull request.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Shadow Notino watches merged GitHub PRs, finds the Notion docs they
          affect, and proposes precise, block-level updates. Nothing is written
          until a human approves.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/demo"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Run the demo
          </Link>
          <Link
            href="/runs"
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            View agent runs
          </Link>
        </div>
      </section>

      <section className="mt-24">
        <h2 className="text-sm font-medium text-muted-foreground">How it works</h2>
        <ol className="mt-4 divide-y rounded-lg border">
          {flow.map((f, i) => (
            <li key={f.step} className="flex items-baseline gap-4 px-4 py-3">
              <span className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium">{f.step}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {f.detail}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto pt-24 text-xs text-muted-foreground">
        Notion is the workspace · GitHub is the source of change · the human
        stays in control.
      </footer>
    </main>
  );
}
