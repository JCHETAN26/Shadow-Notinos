# Shadow Notino — Production Readiness

> Where the system stands against a production-grade checklist for a tool that
> touches **private repositories** and **private Notion workspaces**. This is an
> honest audit: what's handled, what was hardened, and — deliberately — what is
> **not yet built** and why.

---

## Audit scorecard

| Area | Test | Status |
|---|---|---|
| Webhook reliability | Massive PR (5k+ lines) doesn't blow the context window | ✅ Fixed — per-file trims + a 16k total diff budget with a truncation note |
| | Duplicate / redelivered webhooks don't double-run | ✅ Fixed — idempotent: one run per `(repo, prNumber)` |
| | Ghost PRs (empty / binary-only) don't waste LLM tokens | ✅ Fixed — short-circuit before retrieval/planner |
| LLM & prose | Prompt injection in a diff can't hijack the agent | ✅ Hardened — fenced + sanitized untrusted content, constrained output, human approval |
| | Hallucination baseline over N real diffs | ⚪ Manual eval (fixture provided; run is yours) |
| | Broken JSON / Markdown never reaches Notion | 🟢 By design — Zod validate + one retry, else the run fails |
| Notion API | App access revoked mid-run fails gracefully | ✅ Fixed — clear 401/403/404/429 messaging |
| | Stays under Notion's ~3 req/s | ✅ Fixed — proactive min-interval limiter + 429 backoff |
| | Doesn't break surrounding native blocks | 🟢 By design — append-only writes; deletes are scoped to ids we created |
| Security | Verifies `X-Hub-Signature-256` on every webhook | 🟢 Done — HMAC verify, 401 on mismatch |
| | Multi-tenant isolation | ⚫ N/A — single-tenant (see Non-goals) |
| | Tokens encrypted at rest | ⚫ N/A — credentials live in env, not the DB (see Non-goals) |

---

## Defenses that were already in the design

- **Human-in-the-loop, always.** The LLM only *proposes*; nothing reaches Notion without an explicit human approval. This is the backstop behind every other defense.
- **Constrained output.** The model can only emit one of six additive action types (`append_*`, `create_review_task`, `update_doc_status`) — there is no delete or overwrite action to express, even under a successful injection.
- **Grounding.** The server forces `runId`, `targetPageId`, and `placement` server-side; a malicious or confused model cannot retarget a different page or flip where an edit lands.
- **Append-only writes.** Content is inserted after a heading or at page end; surrounding toggles, callouts, and databases are never edited. The only deletes (pending-toggle cleanup) target block ids the system itself created.
- **Webhook authentication.** Every delivery's HMAC signature is verified against the raw body before anything runs.

## Hardening shipped (PRs #18–#22)

1. **Idempotency** — duplicate/redelivered merge webhooks no longer create overlapping runs on the same page.
2. **Ghost-PR short-circuit** — empty and binary-only PRs close cleanly before any LLM call.
3. **Notion rate limiter** — a process-wide ~3 req/s throttle, composed with 429 backoff.
4. **Prompt-injection hardening** — untrusted PR content is fenced and sanitized; a hostile-PR fixture (`sample-pr-injection.ts`) makes the test repeatable.
5. **Massive-PR budget + graceful errors** — a 16k diff ceiling, and clear messages when Notion access is revoked or a page is gone.

Each was verified with a focused test at the logic level. The Notion **write** paths themselves are typechecked but not exercised in CI (no Notion credentials in CI) — they're validated by running the live demo.

---

## Non-goals (deliberate, not oversights)

**This is a single-tenant system.** One Notion workspace, one set of repositories, credentials supplied via environment variables. That scope is intentional for the current product.

Two checklist items only become meaningful in a multi-tenant SaaS, and are therefore **not built** rather than half-built:

- **Multi-tenant isolation.** There is no user/tenant model, so there is no tenant boundary to leak across. Going multi-tenant would add authentication, per-tenant scoping on every query, and workspace/repo ownership.
- **Token encryption at rest.** No third-party tokens are stored in the database — they live in env. The moment you store *per-user* GitHub/Notion tokens (required for multi-tenant), they must be encrypted at rest (e.g. AES-256) with a managed key.

These two are the first work items on a path to SaaS. Documenting the boundary is more honest — and more useful to a reader — than a bolted-on partial implementation.

## Known residual

Under worker concurrency (2), two *different* PRs touching the *same* page could each create a "Pending changes" toggle. Appends are non-destructive so nothing is corrupted, but it's slightly untidy. A per-page lock (or `ensurePendingToggle` upsert-by-title guard) is the clean fix if this matters in practice.
