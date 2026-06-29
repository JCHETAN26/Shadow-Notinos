# Shadow Notino

**An agentic GitHub-to-Notion documentation system.** Shadow Notino watches
merged pull requests, analyzes the code changes, retrieves related Notion
engineering docs, proposes safe block-level documentation updates, asks for
human approval, and writes approved changes back into Notion.

> A technical writer agent living inside your Notion workspace.

Engineering docs go stale because teams ship code faster than they update the
wiki. Shadow Notino closes that gap — without ever silently editing your docs.

---

## How it works

```
GitHub PR merged
  → webhook → BullMQ job
  → fetch PR diff + metadata
  → retrieve related Notion docs (pgvector)
  → Claude proposes a structured patch plan (Zod-validated)
  → human approves in the Next.js UI
  → Notion writer applies real block changes
  → every step recorded in the Postgres audit log
```

The LLM **never** writes to Notion. It only proposes a validated `DocPatchPlan`;
the backend applies approved actions. Human approval is mandatory.

## Tech stack

| Layer        | Tech                                                        |
| ------------ | ----------------------------------------------------------- |
| Frontend     | Next.js, React, TypeScript, Tailwind CSS                    |
| Backend      | Node.js, Express, TypeScript                                |
| Jobs         | BullMQ + Redis                                              |
| Data         | PostgreSQL + pgvector, Prisma                               |
| Integrations | Notion API, GitHub API + webhooks, Claude API              |
| Contracts    | Zod schemas in `@shadow/shared`                             |

## Repository layout

```
shadow-notino/
  apps/
    web/        Next.js app (landing, runs, approval UI, demo)
    api/        Express API, BullMQ worker, Prisma, services, scripts
  packages/
    shared/     Zod schemas + types shared across the boundary
  infra/
    docker-compose.yml   local Postgres (pgvector) + Redis
  docs/         BUILD_PLAN.md, SYSTEM_PROMPT.md
```

## Local setup

Prerequisites: Node 20+, pnpm 9, Docker.

```bash
# 1. Install deps
pnpm install

# 2. Configure env
cp .env.example .env   # fill in GitHub / Notion / Anthropic keys as you reach each phase

# 3. Start Postgres (pgvector) + Redis
pnpm infra:up

# 4. Apply the database schema
pnpm db:migrate

# 5. Run web + API (+ worker) together
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 (`/health` for a liveness + dependency check)

> The local Postgres is published on host port **5435** (see `infra/docker-compose.yml`)
> to avoid clashing with other Postgres instances; the API connects over that port.

## Notion setup

1. Create an internal integration at https://www.notion.so/my-integrations and
   copy its secret into `NOTION_API_KEY`.
2. Create a Notion page to hold the workspace, **share it with the integration**
   (`•••` → Connections), and put its id in `NOTION_PARENT_PAGE_ID`.
3. Seed the databases and sample docs, writing the resulting IDs back to `.env`:

   ```bash
   pnpm notion:seed --write-env   # creates Engineering Docs, Services, PR Updates,
                                  # Agent Runs, Doc Review Tasks + 3 sample docs
   pnpm notion:seed --verify      # re-checks IDs + required properties
   ```

4. Confirm the API can read them: `GET /api/notion/docs` lists the seeded docs
   live from Notion.

## Workflow

`main` is protected. All work lands through pull requests, gated by GitHub
Actions CI (lint/typecheck/build + a Prisma migration check against a real
Postgres service). See `.github/workflows/`.

## Status

Built in phases (see `docs/BUILD_PLAN.md`):

- [x] **Phase 1** — Monorepo + infrastructure (`pnpm dev` runs web + API)
- [x] **Phase 2** — Notion workspace seeder (`pnpm notion:seed`, `--verify`)
- [ ] Phase 3 — GitHub webhook + replay
- [ ] Phase 4 — PR context fetcher
- [ ] Phase 5 — Notion indexer + search
- [ ] Phase 6 — Agent planner
- [ ] Phase 7 — Approval UI
- [ ] Phase 8 — Notion writer
- [ ] Phase 9 — Demo page
- [ ] Phase 10 — Polish

## License

Portfolio project. All rights reserved unless stated otherwise.
