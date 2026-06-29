# BUILD_PLAN.md

# Shadow Notino

## Autonomous Documentation Agent for Notion

## One-Line Pitch

Shadow Notino is an agentic GitHub-to-Notion documentation system that watches merged pull requests, analyzes code changes, finds outdated engineering docs, proposes Notion-native documentation updates, and writes approved changes directly into Notion pages.

---

# 1. Why This Project Exists

Engineering documentation becomes outdated because developers ship code faster than teams update their internal docs.

A merged pull request may change:

* API endpoints
* function behavior
* service dependencies
* environment variables
* architecture diagrams
* database models
* failure modes
* onboarding instructions

But the Notion engineering wiki often stays stale.

Shadow Notino solves this by acting like an autonomous technical documentation teammate.

It reads merged PRs, reasons about the architectural impact, finds related Notion docs, proposes block-level documentation edits, asks for human approval, then writes approved updates back into Notion.

---

# 2. Why This Fits Notion

This project is built around Notion’s actual product surface.

It demonstrates:

* Notion API usage
* Notion database modeling
* Notion block-tree manipulation
* AI agents for knowledge work
* human-in-the-loop workflows
* TypeScript/Node.js backend systems
* React/Next.js product UI
* Postgres-backed state and audit logging
* GitHub workflow automation
* internal tool/productivity thinking

The goal is not to build a Notion clone.

The goal is to build a feature that could plausibly belong inside Notion.

---

# 3. MVP Demo Flow

The MVP should be demoable in under 2 minutes.

## Demo Setup

Create a Notion workspace with:

* Engineering Docs database
* Services database
* Agent Runs database
* Doc Review Tasks database

Create one sample engineering doc:

```text
Search Service API Reference
```

It currently documents:

```text
GET /search
POST /search/reindex
```

Create a GitHub pull request:

```text
PR #184 — Add ranking fallback for slow search provider
```

The PR changes:

* a new API parameter: fallback_strategy
* a timeout fallback path
* a new response field: ranking_source
* a config variable: SEARCH_FALLBACK_TIMEOUT_MS

## Demo Steps

1. Merge the GitHub PR.
2. GitHub webhook triggers Shadow Notino.
3. Backend fetches PR diff, changed files, commits, and metadata.
4. Agent analyzes the architectural impact.
5. Notion indexer searches related engineering docs.
6. Agent proposes a documentation patch.
7. Next.js approval UI displays proposed block-level changes.
8. User clicks “Approve and Write to Notion.”
9. Notion page updates with callouts, code snippets, API table changes, review checklist, and linked PR metadata.
10. Agent run is logged in Postgres and Notion.

---

# 4. MVP Scope

Build only the core proof first.

## Must Have

* GitHub PR merged webhook
* PR diff fetcher
* Notion page/database reader
* Notion recursive block crawler
* Notion content index in Postgres + pgvector
* Claude-based agent planner
* Zod-validated patch schema
* Next.js approval UI
* Notion block writer
* BullMQ job queue
* Postgres audit log
* demo Notion workspace template

## Should Have

* rerun failed agent run
* retry Notion writes on rate limits
* doc freshness status
* verification checklist
* PR-linked comments
* manual trigger from UI

## Later

* Notion webhooks for re-indexing docs after manual edits
* GitHub app installation flow
* multi-workspace support
* OAuth
* permissions-aware retrieval
* Slack notification
* PR comment back to GitHub
* diagram generation
* markdown-to-block conversion
* MCP server wrapper

---

# 5. Tech Stack

## Frontend

* Next.js
* TypeScript
* React
* Tailwind CSS
* shadcn/ui
* Vercel-style UI
* diff viewer
* timeline UI

## Backend

* Node.js
* TypeScript
* Express or Next.js route handlers
* BullMQ
* Redis
* Prisma
* PostgreSQL
* pgvector

## Integrations

* GitHub API
* GitHub webhooks
* Notion API
* Claude API
* Optional: Notion MCP later

## Infrastructure

* Docker Compose
* Neon or local PostgreSQL
* Redis
* Vercel for frontend
* Render/Fly.io/Railway for backend if deployed
* ngrok or Cloudflare Tunnel for local webhook demo

---

# 6. System Architecture

```text
GitHub PR Merged
      ↓
GitHub Webhook
      ↓
Node.js Webhook API
      ↓
BullMQ Job Queue
      ↓
GitHub Diff Fetcher
      ↓
Impact Analyzer
      ↓
Notion Workspace Indexer
      ↓
Postgres + pgvector Retrieval
      ↓
Claude Agent Planner
      ↓
Zod Patch Validation
      ↓
Next.js Approval UI
      ↓
Notion Block Writer
      ↓
Postgres Audit Log + Notion Agent Run Page
```

---

# 7. Data Model

## agent_runs

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_title TEXT NOT NULL,
  pr_url TEXT NOT NULL,
  author TEXT,
  status TEXT NOT NULL,
  diff_summary TEXT,
  impact_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## notion_docs

```sql
CREATE TABLE notion_docs (
  id UUID PRIMARY KEY,
  notion_page_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  service_name TEXT,
  owner TEXT,
  doc_status TEXT,
  last_indexed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## notion_blocks

```sql
CREATE TABLE notion_blocks (
  id UUID PRIMARY KEY,
  notion_page_id TEXT NOT NULL,
  notion_block_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  heading_path TEXT,
  plain_text TEXT,
  token_count INTEGER,
  embedding VECTOR(1536),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## patch_plans

```sql
CREATE TABLE patch_plans (
  id UUID PRIMARY KEY,
  agent_run_id UUID REFERENCES agent_runs(id),
  target_page_id TEXT NOT NULL,
  status TEXT NOT NULL,
  patch_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  applied_at TIMESTAMP
);
```

## patch_actions

```sql
CREATE TABLE patch_actions (
  id UUID PRIMARY KEY,
  patch_plan_id UUID REFERENCES patch_plans(id),
  action_type TEXT NOT NULL,
  target_block_id TEXT,
  heading_match TEXT,
  notion_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP
);
```

---

# 8. Notion Workspace Template

Create these databases inside Notion.

## Engineering Docs

Properties:

```text
Name: Title
Service: Relation to Services
Owner: Person
Doc Status: Select — Fresh, Needs Review, Outdated, Unknown
Last Verified: Date
Source Repo: URL
Related PRs: Relation to PR Updates
Agent Notes: Rich text
```

## Services

Properties:

```text
Name: Title
Repo: URL
Owner: Person
Criticality: Select — Low, Medium, High
Docs: Relation to Engineering Docs
```

## PR Updates

Properties:

```text
Name: Title
Repo: Text
PR Number: Number
PR URL: URL
Author: Text
Merged At: Date
Impact Type: Multi-select — API, Config, Data Model, Dependency, UI, Infra
Related Service: Relation to Services
```

## Agent Runs

Properties:

```text
Name: Title
Status: Select — Queued, Analyzing, Waiting Approval, Applied, Failed
PR: Relation to PR Updates
Target Docs: Relation to Engineering Docs
Actions Proposed: Number
Actions Applied: Number
Run URL: URL
```

## Doc Review Tasks

Properties:

```text
Name: Title
Status: Select — Todo, In Review, Done
Priority: Select — Low, Medium, High
Owner: Person
Related Doc: Relation to Engineering Docs
Related PR: Relation to PR Updates
Reason: Rich text
Due Date: Date
```

---

# 9. Patch Plan JSON Contract

The agent must return structured JSON only.

```ts
export const DocPatchPlanSchema = z.object({
  runId: z.string(),
  targetPageId: z.string(),
  targetPageTitle: z.string(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  risks: z.array(z.string()),
  actions: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("append_callout"),
        targetHeading: z.string(),
        icon: z.string().optional(),
        text: z.string(),
      }),
      z.object({
        type: z.literal("append_code_block"),
        targetHeading: z.string(),
        language: z.string(),
        code: z.string(),
      }),
      z.object({
        type: z.literal("append_todo"),
        targetHeading: z.string(),
        text: z.string(),
        checked: z.boolean().default(false),
      }),
      z.object({
        type: z.literal("append_bullets"),
        targetHeading: z.string(),
        bullets: z.array(z.string()),
      }),
      z.object({
        type: z.literal("create_review_task"),
        title: z.string(),
        reason: z.string(),
        priority: z.enum(["Low", "Medium", "High"]),
      }),
      z.object({
        type: z.literal("update_doc_status"),
        status: z.enum(["Fresh", "Needs Review", "Outdated", "Unknown"]),
        reason: z.string(),
      }),
    ])
  ),
});
```

---

# 10. Agent Tools

The agent should not directly call Notion write APIs.

It should call tools that return controlled data.

## Tool 1: get_pr_context

Input:

```json
{
  "repo": "owner/repo",
  "pr_number": 184
}
```

Returns:

```json
{
  "title": "...",
  "description": "...",
  "files_changed": [],
  "diff_summary": "...",
  "commits": [],
  "labels": []
}
```

## Tool 2: search_notion_docs

Input:

```json
{
  "query": "search fallback ranking API endpoint",
  "top_k": 5
}
```

Returns:

```json
[
  {
    "page_id": "...",
    "title": "Search Service API Reference",
    "score": 0.84,
    "matching_sections": []
  }
]
```

## Tool 3: get_notion_page_structure

Input:

```json
{
  "page_id": "..."
}
```

Returns:

```json
{
  "title": "...",
  "headings": [],
  "blocks": []
}
```

## Tool 4: propose_patch

The agent returns a DocPatchPlan JSON object.

## Tool 5: apply_patch

This is not called by the LLM directly.

Only the backend calls it after human approval.

---

# 11. API Endpoints

## GitHub Webhook

```text
POST /api/webhooks/github
```

Receives merged PR events.

## Agent Runs

```text
GET /api/runs
GET /api/runs/:id
POST /api/runs/:id/retry
POST /api/runs/manual
```

## Patch Review

```text
GET /api/runs/:id/patch
POST /api/runs/:id/approve
POST /api/runs/:id/reject
PATCH /api/runs/:id/patch
```

## Notion Indexing

```text
POST /api/notion/index
POST /api/notion/index/:pageId
GET /api/notion/search?q=
```

## Demo Helpers

```text
POST /api/demo/seed
POST /api/demo/simulate-pr
POST /api/demo/reset
```

---

# 12. Frontend Pages

## /

Landing page.

Show:

* product pitch
* architecture diagram
* demo CTA
* GitHub link
* Notion workspace screenshots

## /runs

Agent run list.

Columns:

* PR
* repo
* status
* target docs
* proposed actions
* created time

## /runs/:id

Main approval page.

Sections:

* PR summary
* architectural impact
* related docs found
* proposed Notion changes
* block-level diff
* risks
* approval buttons
* timeline

## /workspace-health

Shows docs that need review.

Cards:

* stale docs
* docs affected by recent PRs
* unverified AI patches
* services without docs

## /demo

Guided demo.

Buttons:

* Seed Notion Workspace
* Simulate GitHub PR
* Run Agent
* Approve Patch
* Open Updated Notion Page

---

# 13. Build Phases

## Phase 0 — Repo Setup

Time: 2–3 hours

Create monorepo:

```text
shadow-notino/
  apps/
    web/
    api/
  packages/
    notion/
    github/
    agent/
    database/
    shared/
  infra/
    docker-compose.yml
  docs/
    BUILD_PLAN.md
    SYSTEM_PROMPT.md
```

Install:

```text
Next.js
TypeScript
Tailwind
shadcn/ui
Node.js API
Prisma
PostgreSQL
pgvector
Redis
BullMQ
Zod
Notion SDK
Octokit
Claude SDK
```

Deliverable:

* app boots
* database connects
* basic homepage renders

---

## Phase 1 — Notion Workspace Setup

Time: 1 day

Build a setup script:

```bash
pnpm notion:seed
```

It should:

* create or verify required Notion databases
* create sample engineering docs
* create sample services
* create sample stale docs
* store database IDs in `.env`

Deliverable:

* Notion workspace template exists
* sample Search Service docs visible in Notion

---

## Phase 2 — GitHub Webhook + PR Fetcher

Time: 1 day

Build:

* GitHub webhook endpoint
* signature verification
* merged PR filter
* PR metadata fetcher
* changed files fetcher
* diff summarizer

Deliverable:

* merge PR or replay payload
* agent_run row created in Postgres
* diff stored and visible in UI

---

## Phase 3 — Notion Block Crawler + Indexer

Time: 1–2 days

Build:

* query Engineering Docs database
* recursively fetch page block children
* convert blocks to plain text
* preserve heading path
* chunk content
* embed chunks
* store in pgvector

Deliverable:

```bash
pnpm notion:index
```

Then:

```bash
pnpm notion:search "search fallback ranking API"
```

returns related Notion docs.

---

## Phase 4 — Agent Planner

Time: 1–2 days

Build:

* Claude prompt
* tool abstraction
* structured JSON output
* Zod validation
* retry-on-invalid-output
* patch_plan storage

Deliverable:

Given PR diff + related docs, agent creates:

* summary
* impact analysis
* target Notion doc
* patch actions
* risk notes
* review tasks

---

## Phase 5 — Approval UI

Time: 1–2 days

Build `/runs/:id`.

Show:

* PR details
* agent reasoning
* related docs
* proposed patch
* diff preview
* approve/reject/edit buttons

Deliverable:

User can inspect patch before anything is written to Notion.

---

## Phase 6 — Notion Writer

Time: 1–2 days

Build:

* action-to-block converter
* append callout
* append code block
* append to-do
* append bullets
* update page properties
* create review task
* create PR update record
* write audit log

Rules:

* never write without approval
* batch writes
* respect rate limits
* retry 429/529
* store every applied action

Deliverable:

Clicking approve writes real blocks into Notion.

---

## Phase 7 — Demo Polish

Time: 1–2 days

Build:

* guided demo page
* sample GitHub payload replay
* reset script
* screenshots
* README
* 2-minute demo video

Demo command:

```bash
pnpm demo:reset
pnpm demo:run
```

Deliverable:

A recruiter can watch:

```text
PR merged → agent runs → patch approved → Notion doc updates
```

---

# 14. Testing Plan

## Unit Tests

* PR parser
* diff summarizer
* block-to-text converter
* embedding chunker
* patch schema validator
* action-to-Notion-block mapper

## Integration Tests

* index Notion page
* search indexed docs
* generate patch plan
* approve patch
* write Notion blocks

## Demo Tests

* seed workspace
* replay PR
* create patch
* approve patch
* verify Notion page updated

---

# 15. README Structure

README should include:

1. Product one-liner
2. Problem statement
3. Demo GIF
4. Architecture diagram
5. Notion workspace template screenshot
6. GitHub PR screenshot
7. Approval UI screenshot
8. Updated Notion doc screenshot
9. Tech stack
10. Setup instructions
11. How the agent works
12. Human-in-the-loop safety model
13. Limitations
14. Resume bullets

---

# 16. Resume Bullets

```latex
\resumeProjectHeading
{\textbf{Shadow Notino} $|$ \emph{Next.js, TypeScript, Node.js, PostgreSQL, pgvector, BullMQ, Notion API, GitHub API, Claude API}}{}

\resumeItemListStart
  \resumeItem{Built an agentic GitHub-to-Notion documentation system that watches merged pull requests, analyzes code diffs, finds related engineering docs, and proposes block-level Notion updates for human approval.}
  \resumeItem{Implemented a Notion workspace indexer that recursively reads page block trees, embeds engineering documentation into \textbf{pgvector}, and retrieves outdated docs related to changed services and API files.}
  \resumeItem{Designed a structured agent planner using \textbf{Claude API} and \textbf{Zod} schemas to generate safe documentation patch plans including callouts, API table updates, code blocks, review tasks, and PR-linked comments.}
  \resumeItem{Built a \textbf{Next.js} approval dashboard and queued Notion writer with \textbf{BullMQ}, applying approved block mutations through the Notion API while preserving a Postgres audit log of agent runs.}
\resumeItemListEnd
```

---

# 17. Success Criteria

This project is complete when:

* a GitHub PR merge triggers the system
* the system fetches PR diffs
* the system indexes real Notion pages
* agent retrieves the correct related doc
* agent proposes useful block-level updates
* UI shows an approval diff
* user approves the patch
* Notion page updates with real blocks
* audit log records every action
* README and demo video make the story obvious in 2 minutes

If all of this works, this becomes a Notion-specific flagship project.
