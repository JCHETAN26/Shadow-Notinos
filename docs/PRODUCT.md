# Shadow Notino — Complete Product Documentation

> The A–Z reference for what Shadow Notino is, how it's built, how every piece
> works, how to run it, and how to extend it. For the quick pitch and setup, see
> the root `README.md`. For the original specs, see `SYSTEM_PROMPT.md` and
> `BUILD_PLAN.md` in this folder.

---

## Table of contents

1. [What it is](#1-what-it-is)
2. [Why it exists](#2-why-it-exists)
3. [Core concepts & glossary](#3-core-concepts--glossary)
4. [System architecture](#4-system-architecture)
5. [Repository structure](#5-repository-structure)
6. [Data model](#6-data-model)
7. [The DocPatchPlan contract](#7-the-docpatchplan-contract)
8. [Lifecycle of an agent run](#8-lifecycle-of-an-agent-run)
9. [Component deep-dive](#9-component-deep-dive)
10. [API reference](#10-api-reference)
11. [CLI scripts](#11-cli-scripts)
12. [Environment variables](#12-environment-variables)
13. [Setup & installation](#13-setup--installation)
14. [Running the demo](#14-running-the-demo)
15. [Testing & verification](#15-testing--verification)
16. [CI/CD & development workflow](#16-cicd--development-workflow)
17. [Configuration & customization](#17-configuration--customization)
18. [Security & the human-in-the-loop safety model](#18-security--the-human-in-the-loop-safety-model)
19. [Error-handling philosophy](#19-error-handling-philosophy)
20. [Limitations & non-goals](#20-limitations--non-goals)
21. [Troubleshooting](#21-troubleshooting)
22. [Extending the system](#22-extending-the-system)
23. [Tech stack & versions](#23-tech-stack--versions)

---

## 1. What it is

Shadow Notino is an **agentic GitHub-to-Notion documentation system**. It watches
merged pull requests, analyzes the code changes, finds the Notion engineering
docs those changes affect, asks Claude to propose precise block-level edits,
shows them to a human for approval, and — only after approval — writes the
changes into Notion. Every step is recorded in an audit log.

In one line: **a technical-writer agent that lives inside your Notion workspace
and keeps the docs honest after every merge.**

It is a portfolio project built to feel like a plausible Notion feature, not a
generic dashboard.

---

## 2. Why it exists

Engineering documentation rots because developers ship faster than they update
the wiki. A merged PR can change API endpoints, config variables, response
shapes, failure modes, or dependencies — and the Notion page describing that
service silently goes stale.

Shadow Notino closes that gap **without ever silently editing your docs**. The
agent proposes; a human disposes. The result is fresh docs with a complete paper
trail of what changed, why, and who approved it.

---

## 3. Core concepts & glossary

| Term | Meaning |
|---|---|
| **Agent run** | One end-to-end processing of a merged PR. Has a status and a timeline of events. Stored in `agent_runs`. |
| **DocPatchPlan** | The structured JSON the LLM produces — a list of proposed, typed edits to one Notion page. The single most important contract. |
| **Patch action** | One item in a plan (e.g. "append a callout under the *Failure Modes* heading"). Six types exist. |
| **Run event** | An auditable record of one step in a run (`webhook_received`, `pr_fetched`, …). Stored in `run_events`. |
| **Indexer** | The job that crawls Notion pages, chunks them, embeds them, and stores vectors in pgvector. |
| **Embedding** | A 384-dimensional vector representation of a text chunk, produced locally by Transformers.js. |
| **Target page** | The single Notion page a plan edits — always one the retrieval step actually returned (grounding). |
| **Worker** | The BullMQ consumer that runs the agent pipeline (fetch → search → plan). |
| **Replay** | Driving the pipeline locally with a bundled sample PR payload, no real GitHub delivery needed. |

---

## 4. System architecture

```
                 GitHub: PR merged
                         │  webhook (HMAC-SHA256 signed)
                         ▼
              POST /api/webhooks/github  ──────────────┐  create agent_run
                         │  enqueue                    ▼
                  BullMQ (Redis)                  Postgres (Prisma)
                         │                              ▲
                         ▼                              │ audit events
                  Agent worker                          │
                ┌────────┴─────────┐                    │
       PR context fetcher    Notion retrieval           │
        (Octokit / fixture)  (pgvector cosine)          │
                │                   ▲                    │
                │            Notion indexer              │
                │        (crawl→chunk→embed)             │
                ▼                   │                    │
        Claude planner  ◄───────────┘                    │
        (DocPatchPlan)                                   │
                │  Zod validate (+1 retry)               │
                ▼                                        │
        store plan (proposed) ───────────────────────────┤
                │                                        │
                ▼                                        │
        Next.js approval UI  ── approve ──► Notion writer │
        (/runs, /runs/:id)                 (blocks.append,│
                                            pages.update) │
                                                 │        │
                                                 ▼        │
                                              Notion  ────┘
```

Three processes at runtime:

1. **API server** (`apps/api/src/index.ts`) — HTTP endpoints + (in dev) the worker.
2. **Worker** — consumes the `shadow-agent` queue. In dev it runs inside the API
   process; in production run it standalone (`pnpm --filter @shadow/api worker`).
3. **Web app** (`apps/web`) — Next.js UI that reads/writes through the API.

Backing services: **Postgres + pgvector** and **Redis**, both via Docker Compose.

---

## 5. Repository structure

```
shadow-notino/
├── apps/
│   ├── web/                      Next.js 15 app (App Router)
│   │   ├── app/
│   │   │   ├── page.tsx          Landing page
│   │   │   ├── runs/page.tsx     Agent run list
│   │   │   ├── runs/[id]/page.tsx  Approval screen (main UI)
│   │   │   └── demo/page.tsx     Guided demo control panel
│   │   ├── components/
│   │   │   ├── StatusBadge.tsx   Run-status pill
│   │   │   ├── ActionView.tsx    Notion-native preview of a patch action
│   │   │   └── ApprovalActions.tsx  Approve/Reject client buttons
│   │   └── lib/
│   │       ├── api.ts            Typed fetch wrapper (NEXT_PUBLIC_API_URL)
│   │       ├── types.ts          View models + STATUS_META
│   │       └── utils.ts          cn() classnames helper
│   │
│   └── api/
│       ├── prisma/
│       │   ├── schema.prisma     Data model (6 models, 3 enums, pgvector)
│       │   └── migrations/       init + embeddings_384_related_docs
│       └── src/
│           ├── index.ts          Express bootstrap, route mounting, dev worker
│           ├── env.ts            Loads root .env, typed env object
│           ├── queue.ts          BullMQ queue + ioredis connection
│           ├── db/prisma.ts      Shared Prisma client (loads env)
│           ├── routes/           health, runs, notion, patches, webhooks, demo
│           ├── workers/          agent.worker.ts (pipeline) + index.ts (runner)
│           ├── services/
│           │   ├── audit.ts      logRunEvent()
│           │   ├── runs.ts       createRunFromEvent()
│           │   ├── patch-plans.ts  savePatchPlan()
│           │   ├── embeddings.ts   local Transformers.js embeddings
│           │   ├── github/pr-context.ts  getPRContext()
│           │   └── notion/       schema, sample-docs, seed, crawl, chunk,
│           │                     indexer, search, read, writer
│           ├── integrations/
│           │   ├── notion.ts     Notion client + block/rich-text helpers
│           │   ├── anthropic.ts  Claude client + callClaude()
│           │   └── github/       client.ts (Octokit), verify.ts (HMAC)
│           ├── agents/planner.ts generatePatchPlan() — the LLM brain
│           ├── fixtures/sample-pr-merged.ts  PR #184 demo payload
│           └── scripts/          notion-seed, notion-index, notion-search
│
├── packages/shared/src/
│   ├── index.ts                  Re-exports + queue names + AgentJobData
│   └── schemas/                  patch, github, notion, run (Zod + types)
│
├── infra/docker-compose.yml      pgvector Postgres (:5435) + Redis (:6379)
├── .github/workflows/            ci.yml (PR gate) + deploy.yml (CD scaffold)
└── docs/                         PRODUCT.md (this file), SYSTEM_PROMPT.md, BUILD_PLAN.md
```

---

## 6. Data model

Defined in `apps/api/prisma/schema.prisma`. Postgres with the `vector` extension.

### Tables

**`agent_runs`** — one row per processed PR.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `repo` | text | `owner/repo` |
| `prNumber` | int | |
| `prTitle`, `prUrl`, `author` | text | |
| `status` | enum `AgentRunStatus` | see below |
| `diffSummary` | text? | compact file summary |
| `impactSummary` | text? | the plan's summary, after planning |
| `prContext` | jsonb? | full `PullRequestContext` |
| `relatedDocs` | jsonb? | `SearchResult[]` from retrieval |
| `createdAt`, `updatedAt` | timestamp | |

**`run_events`** — append-only audit timeline (FK → `agent_runs`, cascade delete).
Fields: `type`, `message?`, `data?` (jsonb), `createdAt`.

**`notion_docs`** — one row per indexed Notion page. `notionPageId` (unique),
`title`, `serviceName?`, `owner?`, `docStatus?`, `lastIndexedAt?`.

**`notion_blocks`** — one row per embedded chunk. `notionPageId`, `notionBlockId`,
`blockType`, `headingPath?`, `plainText`, `tokenCount`, and
**`embedding vector(384)`** (managed via raw SQL — Prisma maps it as `Unsupported`).

**`patch_plans`** — one row per generated plan (FK → `agent_runs`).
`targetPageId`, `status` (`PatchPlanStatus`), `patchJson` (the full DocPatchPlan),
`createdAt`, `approvedAt?`, `appliedAt?`.

**`patch_actions`** — one row per action in a plan (FK → `patch_plans`).
`actionType`, `headingMatch?`, `notionPayload` (the action object), `status`
(`PatchActionStatus`), `errorMessage?`, `notionId?`, `appliedAt?`.

### Enums

- **`AgentRunStatus`**: `queued`, `fetching_pr`, `indexing`, `searching`,
  `planning`, `waiting_approval`, `applying`, `applied`, `rejected`, `failed`.
- **`PatchPlanStatus`**: `proposed`, `approved`, `rejected`, `applied`, `failed`.
- **`PatchActionStatus`**: `pending`, `applied`, `failed`, `skipped`.

---

## 7. The DocPatchPlan contract

Defined in `packages/shared/src/schemas/patch.ts`. This is the only thing the LLM
is allowed to produce.

```ts
DocPatchPlan = {
  runId: string,
  targetPageId: string,
  targetPageTitle: string,
  confidence: number,        // 0..1
  summary: string,
  risks: string[],
  actions: PatchAction[],
}
```

`runId`, `targetPageId`, and `targetPageTitle` are **forced server-side** after
the model responds, so the LLM can never retarget or invent a page.

### The six action types (discriminated union on `type`)

| Type | Fields | Effect in Notion |
|---|---|---|
| `append_callout` | `targetHeading`, `text`, `icon?` | Callout block under the heading |
| `append_code_block` | `targetHeading`, `language`, `code` | Fenced code block |
| `append_todo` | `targetHeading`, `text`, `checked` | To-do item (verification task) |
| `append_bullets` | `targetHeading`, `bullets[]` | Bulleted list |
| `create_review_task` | `title`, `reason`, `priority` | New page in the Doc Review Tasks DB |
| `update_doc_status` | `status`, `reason` | Sets the target page's *Doc Status* select |

`status` ∈ `Fresh | Needs Review | Outdated | Unknown`; `priority` ∈ `Low | Medium | High`.

### Other shared schemas

- **`GitHubMergedPREvent`** — the slice of the webhook payload we validate.
- **`PullRequestContext`** — compact, LLM-ready PR representation (`filesChanged`,
  `commits`, `diffSummary`, trimmed `patchExcerpt`s).
- **`NotionDocChunk`** / **`SearchResult`** — retrieval shapes.
- **`AgentRun`** / **`AgentRunStatus`** / **`RunEventType`** — run lifecycle.
- **`NotionWriteResult`** — per-action write outcome.

---

## 8. Lifecycle of an agent run

A run moves through statuses, emitting an audit event at each step. Here's the
full path for the happy case (driven by `apps/api/src/workers/agent.worker.ts`):

| # | Status | Event logged | What happens |
|---|---|---|---|
| 1 | `queued` | `webhook_received` | Webhook (or replay) validates a merged PR, creates the run, enqueues a job. |
| 2 | `fetching_pr` | `pr_fetched` | Worker fetches PR metadata, changed files, commits → stores `prContext` + `diffSummary`. |
| 3 | `searching` | `docs_searched` | Builds a query from the PR, runs pgvector search → stores `relatedDocs`. |
| 4 | `planning` | `patch_generated` | Picks the top doc as target, fetches its headings, asks Claude for a plan, validates it, persists `patch_plans` + `patch_actions`. |
| 5 | `waiting_approval` | — | Run waits. The UI shows the proposed actions + risks. |
| 6 | `applying` | `patch_approved` | Human clicks Approve. Plan marked `approved`. |
| 7 | `applied` | `block_write_started` → `block_write_completed` → `run_completed` | Writer applies each action to Notion, recording per-action outcomes. |

Failure branches:

- **No related docs** (workspace not seeded/indexed) → run `failed`, `run_failed`.
- **No `ANTHROPIC_API_KEY`** → run `failed`, `run_failed`.
- **Invalid LLM JSON twice** → run `failed`, `run_failed` with the precise Zod path.
- **Reject** → plan `rejected`, run `rejected`, `patch_rejected`.
- **Notion write error** → action row `failed` + `write_failed`; run `failed` if any action fails.

---

## 9. Component deep-dive

### 9.1 Shared contracts (`packages/shared`)
Pure Zod schemas + inferred TypeScript types, plus the queue constants
(`AGENT_QUEUE_NAME = "shadow-agent"`, `AGENT_JOB_NAME`, `AgentJobData`). Imported
by both the API and the web app (the web app transpiles it directly from source).

### 9.2 Env loader (`apps/api/src/env.ts`)
Loads the single **root `.env`** (resolved via `import.meta.url`, so it works from
the server, the worker, and any script). Exposes a typed `env` object; throws a
clear error for a missing `DATABASE_URL`, treats third-party keys as optional so
non-LLM/non-Notion commands still run.

### 9.3 Queue (`apps/api/src/queue.ts`)
An `ioredis` connection (`maxRetriesPerRequest: null`, required by BullMQ) and the
`agentQueue` with 3 attempts + exponential backoff.

### 9.4 Audit (`apps/api/src/services/audit.ts`)
`logRunEvent(runId, type, message?, data?)` writes a `run_events` row and mirrors
to stdout so the demo is legible in the API logs.

### 9.5 GitHub integration
- `integrations/github/verify.ts` — `verifyGitHubSignature()`: timing-safe HMAC-SHA256 check of `X-Hub-Signature-256`.
- `integrations/github/client.ts` — lazy Octokit (auth if `GITHUB_TOKEN` set).
- `services/github/pr-context.ts` — `getPRContext()`: live path pulls PR + files + commits and **trims patches to 30 lines / 25 files**; demo path builds context from the bundled fixture for `acme/search-service`. Output validated with `PullRequestContextSchema`.

### 9.6 Notion integration
- `integrations/notion.ts` — lazy Notion client + block builders (`paragraph`, `heading`, `bullet`, `code`, `callout`, `todo`) and `richTextToPlain`.
- `services/notion/schema.ts` — the 5 databases' property definitions; relations added in a **second pass** (the relations are circular).
- `services/notion/sample-docs.ts` — 3 sample docs (Search Service API Reference, Auth Service Architecture, Ranking Pipeline Overview) + 3 services.
- `services/notion/seed.ts` — `seedWorkspace()` (create DBs + content, mirror into Postgres) and `verifyWorkspace()` (check IDs + required props).
- `services/notion/crawl.ts` — recursive block-tree crawler that tracks the **heading breadcrumb** for each block.
- `services/notion/chunk.ts` — groups blocks under the same heading into ~120-word chunks (heading path prepended for embedding context).
- `services/notion/indexer.ts` — `indexPage()` / `indexAllEngineeringDocs()`: crawl → chunk → embed → raw-insert into pgvector.
- `services/notion/search.ts` — `searchDocs()` (cosine ranking, grouped by page) + `getPageHeadings()` (distinct indexed headings for a page, offline).
- `services/notion/read.ts` — `listEngineeringDocs()` reads the DB live from Notion.
- `services/notion/writer.ts` — `applyPatchPlan()`: applies each action with `withRetry()` (429/5xx backoff), records outcomes, logs the chain.

### 9.7 Embeddings (`apps/api/src/services/embeddings.ts`)
Local **Transformers.js** (`Xenova/all-MiniLM-L6-v2`, **384-dim**). `embed()` returns
an L2-normalized vector; `toVectorLiteral()` formats it as a pgvector literal. No
API key; the ~90 MB model downloads once and is cached.

### 9.8 Planner (`apps/api/src/agents/planner.ts` + `integrations/anthropic.ts`)
- `callClaude(system, user)` calls `claude-opus-4-8` (override with `CLAUDE_MODEL`), `max_tokens: 8000`, returns text.
- `generatePatchPlan(input, callModel?)` builds the system + user prompt (PR context, related docs, target headings), calls the model, extracts JSON (`extractJson` handles fenced + prose), forces identity fields, validates with `DocPatchPlanSchema`, and **retries once** with the validation error fed back. `callModel` is injectable for tests.

### 9.9 Worker (`apps/api/src/workers/agent.worker.ts`)
`processAgentJob()` runs steps 2–4 above. `createAgentWorker()` builds the BullMQ
worker (concurrency 2). Shared by the standalone runner (`workers/index.ts`) and
the in-process dev worker (started from `index.ts` unless `RUN_WORKER=false`).

### 9.10 Persistence (`apps/api/src/services/patch-plans.ts`, `runs.ts`)
- `savePatchPlan(plan)` — writes `patch_plans` + one `patch_actions` row per action (`proposed`).
- `createRunFromEvent(payload)` — Zod-parses, filters to merged PRs, creates the run, logs `webhook_received`, enqueues the job.

### 9.11 Web app
- **Landing** (`app/page.tsx`) — pitch + flow.
- **Runs list** (`app/runs/page.tsx`) — server component, status badges, empty/error states.
- **Run detail** (`app/runs/[id]/page.tsx`) — the approval screen: impact summary, changed-files diffs, related docs, proposed actions (rendered by `ActionView`), risks, timeline, and `ApprovalActions`.
- **Demo** (`app/demo/page.tsx`) — client component, numbered steps with live status dots, polls the run until terminal.

---

## 10. API reference

Base URL: `http://localhost:4000`. All JSON. Errors return `{ "error": "<message>" }`.

### Health & info
| Method | Path | Description |
|---|---|---|
| GET | `/` | Service info + endpoint list |
| GET | `/health` | Liveness + Postgres/Redis checks (`200` healthy, `503` degraded) |

### Runs
| Method | Path | Description |
|---|---|---|
| GET | `/api/runs` | List runs (newest first, 50) |
| GET | `/api/runs/:id` | Full run detail: events, patch plans + actions |

### Patch review
| Method | Path | Description |
|---|---|---|
| GET | `/api/runs/:id/patch` | Latest plan + actions |
| POST | `/api/runs/:id/approve` | Approve **and apply to Notion**; returns the write result |
| POST | `/api/runs/:id/reject` | Reject the plan |
| PATCH | `/api/runs/:id/patch` | Replace the proposed plan with an edited, Zod-validated version |

### Notion
| Method | Path | Description |
|---|---|---|
| GET | `/api/notion/docs` | List Engineering Docs live from Notion |
| GET | `/api/notion/search?q=&k=` | Semantic search over indexed content |

### Webhook
| Method | Path | Description |
|---|---|---|
| POST | `/api/webhooks/github` | Merged-PR webhook. `503` no secret · `401` bad sig · `200` ignored · `202` enqueued |

### Demo helpers
| Method | Path | Description |
|---|---|---|
| POST | `/api/demo/replay-github-event` | Replay a posted payload or the built-in PR #184 |
| POST | `/api/demo/verify` | Verify the Notion databases exist |
| POST | `/api/demo/index` | Reindex Engineering Docs into pgvector |
| POST | `/api/demo/reset` | Delete all agent runs (cascades) |

---

## 11. CLI scripts

Run from the repo root (or `pnpm --filter @shadow/api <script>`).

| Command | What it does |
|---|---|
| `pnpm dev` | Start web + API (+ worker) in parallel |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm infra:up` / `:down` / `:logs` | Manage Postgres + Redis containers |
| `pnpm db:migrate` | Apply Prisma migrations (via root `.env`) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm notion:seed [--verify\|--force\|--write-env]` | Create/verify the Notion workspace |
| `pnpm notion:index` | Crawl → chunk → embed → pgvector |
| `pnpm notion:search "query"` | Semantic search from the terminal |

---

## 12. Environment variables

Copy `.env.example` → `.env`. The single root `.env` is shared by the API, worker,
and scripts.

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | everything | Defaults to local Postgres on **port 5435** |
| `REDIS_URL` | queue | `redis://localhost:6379` |
| `GITHUB_WEBHOOK_SECRET` | live webhook | Without it the webhook returns `503` (use replay instead) |
| `GITHUB_TOKEN` | live PR fetch | Optional; raises rate limits / private repos |
| `ANTHROPIC_API_KEY` | planner | Required to generate a plan |
| `CLAUDE_MODEL` | planner | Optional override (default `claude-opus-4-8`) |
| `NOTION_API_KEY` | all Notion ops | Internal integration secret |
| `NOTION_PARENT_PAGE_ID` | seeding | Page (shared with the integration) the DBs are created under |
| `NOTION_ENGINEERING_DOCS_DATABASE_ID` | index/read/write | Set by `--write-env` |
| `NOTION_SERVICES_DATABASE_ID` | seeding | |
| `NOTION_AGENT_RUNS_DATABASE_ID` | seeding | |
| `NOTION_PR_UPDATES_DATABASE_ID` | seeding | |
| `NOTION_REVIEW_TASKS_DATABASE_ID` | review tasks | Needed for `create_review_task` |
| `API_PORT` | API | Default `4000` |
| `NEXT_PUBLIC_API_URL` | web | Where the browser reaches the API |
| `RUN_WORKER` | dev | Set `false` to not start the worker in the API process |

---

## 13. Setup & installation

Prerequisites: **Node 20+, pnpm 9, Docker**.

```bash
pnpm install                 # 1. install
cp .env.example .env         # 2. configure (fill keys as needed)
pnpm infra:up                # 3. start Postgres (pgvector) + Redis
pnpm db:migrate              # 4. apply schema (enables the vector extension)
pnpm dev                     # 5. run web (:3000) + API (:4000) + worker
```

### Notion setup (for the full demo)
1. Create an integration at <https://www.notion.so/my-integrations>, copy the
   secret into `NOTION_API_KEY`.
2. Create a Notion page, **share it with the integration** (`•••` → Connections),
   put its id in `NOTION_PARENT_PAGE_ID`.
3. `pnpm notion:seed --write-env` (creates the 5 DBs + sample docs, writes IDs back).
4. `pnpm notion:index` (embeds the docs).

> **Port note:** local Postgres is published on host **5435** (not 5432) to avoid
> clashing with other local Postgres instances. Reflected in `.env.example` and
> `infra/docker-compose.yml`.

---

## 14. Running the demo

### Tier 1 — no credentials
`pnpm dev`, then:
```bash
curl localhost:4000/health
curl -XPOST localhost:4000/api/demo/replay-github-event -H 'Content-Type: application/json' -d '{}'
```
Open `localhost:3000/runs` and the run detail page. Without Notion/Claude keys the
run stops at planning and is marked `failed`, but PR context + diff + timeline all
render.

### Tier 2 — full end-to-end
After Notion + Anthropic keys are set and the workspace is seeded + indexed, open
`localhost:3000/demo` and click through: **Verify → Index → Replay PR #184 → watch
the agent → Open run → Approve and Write to Notion.** The "Search Service API
Reference" page gains a ranking-fallback callout, a config code block, and a
verification to-do; a Doc Review Task is filed; the run is fully logged.

The sample PR (`#184 — Add ranking fallback for slow search provider`) introduces
a `fallback_strategy` param, a `SEARCH_FALLBACK_TIMEOUT_MS` config var, and a
`ranking_source` response field.

---

## 15. Testing & verification

What was verified during the build, and how you can re-check it:

- **Infra/health** — `pnpm dev` → `GET /health` reports `postgres: ok, redis: ok`.
- **Webhook security** — signed merged PR → `202`; bad signature → `401`; `opened`
  PR and `push` events → `200 ignored`.
- **PR fetch** — replaying PR #184 stores 3 files + 3 commits; `GET /api/runs/:id`
  returns the full `prContext`.
- **Embeddings** — 384-dim; cosine(query, relevant) ≈ 0.82 vs (query, irrelevant)
  ≈ −0.04.
- **Vector search** — raw insert + `searchDocs` ranks the correct doc first.
- **Planner** — injected fake model proves: valid parse forces ids; invalid-then-
  valid triggers exactly one retry; invalid-twice throws `Validation failed at …`.
- **Writer** — block builders produce correct Notion shapes; `applyPatchPlan`
  fails gracefully without a key.
- **UI** — `next build` passes; `/runs` and `/runs/:id` render live.

CI validates compile, build, and migrations on every PR. Notion/Claude live calls
are not exercised in CI (they need real credentials).

---

## 16. CI/CD & development workflow

- **`main` is protected by convention** — all work lands through PRs.
- **`.github/workflows/ci.yml`** runs on every PR: install → `prisma generate` →
  `pnpm -r typecheck` → `pnpm -r build`, plus a `db` job that applies migrations
  against a real pgvector Postgres service.
- **`.github/workflows/deploy.yml`** is a manual-dispatch CD scaffold; wire in a
  target (Vercel for web, Railway/Fly/Render for API + worker + Postgres) when
  ready.
- The project was built in 10 phases, each shipped as PR #1–#10 with green CI and
  squash-merged.

---

## 17. Configuration & customization

| Want to… | Do this |
|---|---|
| Use a different Claude model | Set `CLAUDE_MODEL` in `.env` |
| Swap embeddings to OpenAI/Voyage | Replace `services/embeddings.ts` and change the `vector(384)` column dimension via a migration |
| Change the local Postgres port | Edit `infra/docker-compose.yml` + `DATABASE_URL` |
| Run the worker separately | `pnpm --filter @shadow/api worker` and set `RUN_WORKER=false` for the API |
| Tune chunk size | `MAX_WORDS` in `services/notion/chunk.ts` |
| Tune diff trimming | `MAX_FILES` / `MAX_PATCH_LINES` in `services/github/pr-context.ts` |
| Adjust retrieval breadth | `topK` in `searchDocs` / the worker query |

---

## 18. Security & the human-in-the-loop safety model

1. **The LLM cannot write to Notion.** It only emits a `DocPatchPlan`. Only
   `services/notion/writer.ts` performs writes, and only after approval.
2. **Mandatory approval.** Generated patches sit in `proposed`. A human must
   Approve (or Reject, or Edit) before anything is applied.
3. **Grounded output.** `targetPageId`/`targetPageTitle` are overwritten
   server-side to a doc retrieval returned — the model can't invent or retarget.
4. **Validated output.** All LLM output passes `DocPatchPlanSchema`; invalid JSON
   retries once, then the run fails with a precise error.
5. **Webhook authenticity.** `X-Hub-Signature-256` is verified with a timing-safe
   HMAC compare; unsigned/invalid requests are rejected.
6. **Full auditability.** Every step is a `run_events` row and every action a
   `patch_actions` row with its own status and error — nothing happens invisibly.

---

## 19. Error-handling philosophy

Every failure returns a **useful, actionable message**, never "something went
wrong." Examples that exist in the code:

- `NOTION_API_KEY is not set. Add it to .env (create an integration at …).`
- `ANTHROPIC_API_KEY is not set — cannot run the planner.`
- `No related docs found (is the workspace seeded + indexed?)`
- `Validation failed at actions.0.priority: Invalid enum value.`
- `Invalid webhook signature.`

The central Express error handler returns `{ error: <message> }` with the right
status; the UI surfaces the message inline.

---

## 20. Limitations & non-goals

- **MVP scope** — no OAuth, multi-tenant auth, or full GitHub App install; a single
  Notion integration token; one workspace.
- **Local embeddings** — chosen for a zero-key demo; lower quality than hosted
  embeddings (swap is one module + a dimension change).
- **Top-level heading match** — append actions target top-level headings; deeply
  nested sections fall back to end-of-page.
- **Notion-dependent paths** can't be tested in CI.
- **In-process dev worker** — fine for local/demo; run it standalone in production.
- Deliberately **out of scope** (per the spec): Slack bot, diagram generation, a
  custom rich-text editor, an MCP server wrapper, markdown-to-block conversion.

---

## 21. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `GET /health` shows `postgres: error` | Containers down → `pnpm infra:up` |
| `Ports are not available: 5432/5435` | Another Postgres is bound; change the host port in `infra/docker-compose.yml` + `DATABASE_URL` |
| `Environment variable not found: DATABASE_URL` (Prisma CLI) | Use `pnpm db:migrate` (it loads root `.env` via dotenv-cli) |
| Web won't start: `EADDRINUSE :3000` | Port taken; run `next dev -p <free port>` |
| Run stuck at `searching`/`failed` with "No related docs" | Seed + index Notion first |
| Planner fails immediately | `ANTHROPIC_API_KEY` missing or invalid |
| First embedding call is slow | One-time ~90 MB model download; cached after |
| Webhook returns `503` | Set `GITHUB_WEBHOOK_SECRET` (or use the replay endpoint) |

---

## 22. Extending the system

Natural next steps, roughly in order of value:

- **Wire CD** — enable `deploy.yml` for Vercel + Railway/Fly; switch the API's
  production `start` to compiled output and run the worker as its own service.
- **PR comment-back** — post the approved changes as a comment on the GitHub PR.
- **Notion webhooks** — re-index a page after a human edits it.
- **Richer diff view** — line-level highlighting in the approval UI.
- **Patch editing UI** — a form on `/runs/:id` that drives `PATCH /api/runs/:id/patch`.
- **Multi-workspace / OAuth** — once the single-tenant MVP is proven.
- **Better retrieval** — hosted embeddings + an HNSW index as the corpus grows.

---

## 23. Tech stack & versions

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript 5, Tailwind CSS 3 |
| Backend | Node 22, Express 4, TypeScript 5 |
| Jobs | BullMQ 5 + Redis 7 (ioredis) |
| Data | PostgreSQL 16 + pgvector, Prisma 6 |
| Embeddings | Transformers.js (`@xenova/transformers`), all-MiniLM-L6-v2, 384-dim |
| Integrations | `@notionhq/client`, `@octokit/rest`, `@anthropic-ai/sdk` |
| Contracts | Zod 3 (`@shadow/shared`) |
| Tooling | pnpm 9 workspaces, tsx, Docker Compose, GitHub Actions |

---

*This document tracks the codebase as of the completion of all 10 build phases.
When you change a component, update the relevant section here.*
