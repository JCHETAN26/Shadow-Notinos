# SYSTEM_PROMPT.md

# Shadow Notino — Claude Code System Prompt

You are helping build Shadow Notino, an agentic GitHub-to-Notion documentation system.

Shadow Notino watches merged GitHub pull requests, analyzes code changes, retrieves related Notion engineering docs, proposes safe documentation updates, asks for human approval, and writes approved changes into Notion using the Notion API.

This is a Notion-focused portfolio project. The goal is to build something that feels like it could be a real Notion feature.

---

# Core Product Philosophy

Do not build a generic dashboard.

Build an AI-native workflow for knowledge work.

The interface should show that:

* Notion is the workspace
* GitHub is the source of engineering change
* the agent keeps documentation fresh
* humans remain in control
* every AI action is inspectable, editable, and auditable

The project should feel like:

```text
A technical writer agent living inside a Notion workspace.
```

---

# Core Demo

The core demo must work end-to-end:

1. A GitHub PR is merged.
2. Webhook hits the Node.js backend.
3. Backend queues an agent job.
4. Job fetches PR metadata, diff, changed files, and commits.
5. Notion indexer retrieves related engineering docs from a Notion database.
6. Agent analyzes the PR and existing docs.
7. Agent proposes a structured documentation patch.
8. Next.js UI shows the patch before writing.
9. User approves.
10. Backend writes approved block changes to Notion.
11. Agent run is logged in Postgres.

If a feature does not support this demo, defer it.

---

# Tech Stack

Use this stack unless explicitly told otherwise:

## Frontend

* Next.js
* TypeScript
* React
* Tailwind CSS
* shadcn/ui
* Vercel-style product UI

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

* Notion API
* GitHub API
* GitHub webhooks
* Claude API
* Zod

## Infrastructure

* Docker Compose
* local PostgreSQL with pgvector
* local Redis
* `.env` for all credentials

---

# Non-Negotiable Rules

## 1. No fake demo data in the core flow

The project can include seeded sample docs, but the actual flow must use:

* real Notion pages
* real Notion database records
* real block reads
* real block writes
* real or replayed GitHub PR payloads
* real stored agent runs

## 2. Human approval is mandatory

The agent must never silently mutate Notion pages.

All Notion writes must go through:

```text
Generated patch → Approval UI → User approval → Notion writer
```

## 3. The LLM cannot directly write to Notion

The LLM only proposes structured patch plans.

The backend validates the plan using Zod.

Only backend code applies approved writes.

## 4. Use structured outputs

All LLM outputs must be validated with Zod.

If output validation fails:

* retry once with validation errors
* if it fails again, mark run as failed
* show the error in the UI

## 5. Preserve auditability

Every important event should be logged:

* webhook received
* PR fetched
* docs searched
* patch generated
* patch approved
* block write started
* block write completed
* write failed
* run completed

## 6. Keep the MVP narrow

Do not add:

* OAuth
* billing
* multi-tenant auth
* full GitHub App installation
* Slack bot
* complex permissions
* MCP server wrapper
* diagram generation
* custom rich text editor

until the core demo works.

---

# Repository Structure

Create this structure:

```text
shadow-notino/
  apps/
    web/
      app/
      components/
      lib/
    api/
      src/
        routes/
        workers/
        services/
        agents/
        integrations/
        db/
  packages/
    shared/
      src/
        schemas/
        types/
  infra/
    docker-compose.yml
  docs/
    BUILD_PLAN.md
    SYSTEM_PROMPT.md
```

---

# Environment Variables

Use `.env.example`.

Required variables:

```text
DATABASE_URL=
REDIS_URL=
GITHUB_WEBHOOK_SECRET=
GITHUB_TOKEN=
ANTHROPIC_API_KEY=
NOTION_API_KEY=
NOTION_ENGINEERING_DOCS_DATABASE_ID=
NOTION_SERVICES_DATABASE_ID=
NOTION_AGENT_RUNS_DATABASE_ID=
NOTION_PR_UPDATES_DATABASE_ID=
NOTION_REVIEW_TASKS_DATABASE_ID=
```

Never hardcode credentials.

---

# Data Contracts

Use TypeScript types and Zod schemas for all boundary objects.

Required schemas:

* GitHubMergedPREvent
* PullRequestContext
* NotionDocChunk
* SearchResult
* AgentRun
* DocPatchPlan
* PatchAction
* NotionWriteResult

---

# Main Schema: DocPatchPlan

The agent must produce this shape:

```ts
const DocPatchPlanSchema = z.object({
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
        checked: z.boolean(),
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

# Implementation Order

Build in this exact order.

## Phase 1 — Monorepo + Infrastructure

Create:

* Next.js web app
* Node.js API
* Prisma
* PostgreSQL
* Redis
* BullMQ
* shared types package

Do not build agents yet.

Deliverable:

```bash
pnpm dev
```

starts web and API.

---

## Phase 2 — Notion Workspace Seeder

Build a script:

```bash
pnpm notion:seed
```

It should create or verify the sample Notion workspace structure.

If creating databases through API is too slow, document manual database setup and write a script to verify database IDs and required properties.

Create sample docs:

* Search Service API Reference
* Auth Service Architecture
* Ranking Pipeline Overview

Deliverable:

The app can read these pages from Notion.

---

## Phase 3 — GitHub Webhook

Build:

```text
POST /api/webhooks/github
```

Behavior:

* verify webhook signature
* ignore non-PR events
* ignore PRs that are not merged
* create agent_run
* enqueue BullMQ job

Also build a replay endpoint for local demo:

```text
POST /api/demo/replay-github-event
```

Deliverable:

A merged PR event creates an agent run in Postgres.

---

## Phase 4 — PR Context Fetcher

Use GitHub API to fetch:

* PR title
* PR body
* changed files
* file patches
* commit messages
* labels
* author
* merge time

Summarize changed files into a compact context object.

Do not send huge diffs directly to the LLM.

Deliverable:

Agent run detail page displays PR context.

---

## Phase 5 — Notion Indexer

Build:

```bash
pnpm notion:index
```

Behavior:

* query Engineering Docs database
* retrieve pages
* recursively fetch block children
* convert blocks to plain text
* preserve page ID, block ID, block type, heading path
* chunk long content
* create embeddings
* store chunks in Postgres + pgvector

Deliverable:

Search endpoint:

```text
GET /api/notion/search?q=search fallback ranking
```

returns relevant docs.

---

## Phase 6 — Agent Planner

Build agent planner.

Input:

* PR context
* top related Notion docs
* current doc structure
* strict output instructions

Output:

* DocPatchPlan JSON

Rules:

* LLM must not invent docs
* LLM must only patch docs returned by retrieval
* LLM must state confidence
* LLM must include risks
* low confidence should create review task instead of aggressive doc rewrite

Deliverable:

Agent run generates a patch plan.

---

## Phase 7 — Approval UI

Build `/runs/:id`.

Display:

* status timeline
* PR metadata
* changed files
* related docs found
* impact summary
* proposed actions
* diff preview
* risks
* approval buttons

Approval buttons:

* Approve and Write to Notion
* Reject
* Edit Patch

Deliverable:

User can approve a patch plan.

---

## Phase 8 — Notion Writer

Build writer service.

Supported actions:

* append_callout
* append_code_block
* append_todo
* append_bullets
* create_review_task
* update_doc_status

Rules:

* find target heading
* append after matching heading or fallback to end of page
* batch writes
* respect rate limits
* retry failed writes
* log every action

Deliverable:

Approved patch writes real blocks into Notion.

---

## Phase 9 — Demo Page

Build `/demo`.

Buttons:

* Seed Workspace
* Index Docs
* Replay PR
* Generate Patch
* Approve Patch
* Open Notion Page

The demo should be linear and obvious.

Deliverable:

A recruiter can understand the system without reading the code.

---

## Phase 10 — Polish

Add:

* README
* architecture diagram
* screenshots
* demo video
* resume bullets
* limitations section
* setup docs

Deliverable:

The GitHub repo feels complete and polished.

---

# Agent Prompt Template

Use this inside the agent planner.

```text
You are Shadow Notino, a careful technical documentation agent.

Your job is to help keep a Notion engineering workspace up to date after GitHub pull requests are merged.

You will receive:
1. Pull request context
2. Changed files and summarized diffs
3. Retrieved Notion documentation pages
4. Current page/block structure

Your task:
Generate a safe documentation patch plan.

Rules:
- Do not directly write to Notion.
- Do not invent pages or APIs.
- Only propose changes grounded in the PR context.
- Prefer small, precise edits over broad rewrites.
- If confidence is low, create a review task instead of editing technical docs.
- Always include human verification tasks for behavior that cannot be proven from the diff.
- Use Notion-native block types: callouts, bullets, code blocks, and to-do items.
- Output JSON only.
```

---

# UI Style Rules

The UI should feel like Notion/Vercel/Linear.

Use:

* neutral colors
* clean typography
* thin borders
* excellent spacing
* readable diffs
* subtle status badges
* monospace for code/diff snippets
* clear empty states
* clear error states

Avoid:

* colorful dashboards
* generic admin templates
* unnecessary charts
* clutter
* fake AI sparkle language

---

# Error Handling Rules

For every failure, show a useful message.

Examples:

Bad:

```text
Something went wrong.
```

Good:

```text
Notion write failed because the target block no longer exists. Re-index the page and regenerate the patch.
```

Bad:

```text
Agent failed.
```

Good:

```text
The agent produced invalid patch JSON. Validation failed at actions[2].targetHeading.
```

---

# README Requirements

The README must include:

* what the project does
* why it matters
* how it fits Notion
* architecture diagram
* demo flow
* setup instructions
* Notion setup instructions
* GitHub webhook setup
* screenshots
* limitations
* resume bullets

---

# Definition of Done

The project is done when this works:

```text
Merge/replay GitHub PR
→ agent run starts
→ related Notion doc is retrieved
→ patch plan is generated
→ user approves patch
→ Notion page updates
→ audit log records all changes
```

Do not optimize anything else until this end-to-end path works.
