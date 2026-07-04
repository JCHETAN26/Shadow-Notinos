# Shadow Notino — v2 Functional Spec

> Status: **DRAFT** · Date: 2026-07-03 · Supersedes the branch/trigger behavior
> described in `BUILD_PLAN.md` (Phases 4–8). The v1 pipeline shipped and works;
> this document defines the **taste layer** that makes the behavior feel finished
> and beats Notion's native GitHub connection on the axes real users complain
> about (setup friction, main-only tracking, no doc-content maintenance).

---

## 1. Why this exists

Notion's native GitHub connection mirrors PR/issue **metadata** into a database.
It never reads a diff and never edits the **prose** of an engineering doc, so docs
still rot after every merge. Shadow Notino closes that gap: it reads the diff,
finds the affected doc, and proposes block-level edits a human approves.

v1 proved the pipeline end to end. v2 pins down the behavioral decisions that were
left at their first-pass defaults. Those defaults are the difference between
"impressive demo" and "feels like a real Notion feature."

---

## 2. Current behavior (verified against code, 2026-07-03)

| Area | What the code does today | File |
|---|---|---|
| Trigger | Fires for **any** merged PR (`action=closed && merged=true`), on **any** base branch. Not "main-only" — it is **branch-unaware**: base/head branch is never captured. | `apps/api/src/services/runs.ts` · `packages/shared/src/schemas/github.ts` |
| Path gating | **None.** Every merged PR starts a run, even if it touched nothing documented. | `runs.ts` |
| Retrieval → plan | Searches top-5 related docs but plans against **`related[0]` only** → a single target page per run. | `apps/api/src/workers/agent.worker.ts` |
| Plan contract | `DocPatchPlan` has a single `targetPageId`. | `packages/shared/src/schemas/patch.ts` |
| No-op outcome | If no related docs are found the run is marked **`failed`**. There is no clean "nothing to update" terminal state. | `agent.worker.ts` |
| Writer | Appends blocks to the page **body**, after the matching heading or at page end. No branch/placement logic, no toggle support. | `apps/api/src/services/notion/writer.ts` · `apps/api/src/integrations/notion.ts` |
| Approval | Always human-approved before any write. **Keep as-is.** | `apps/api/src/routes/patches.ts` |

Data model note: `AgentRun.patchPlans` is already a one-to-many relation, so
**multi-page needs no schema change** — the worker just creates one `PatchPlan`
per target page.

---

## 3. v2 functional spec (decisions)

| # | Decision | Behavior |
|---|---|---|
| 1 | **Trigger scope** | Every merged PR, **all branches**. Nothing missed. |
| 2 | **Path gating** | Only PRs touching **configured paths** start a run (no junk proposals). |
| 3 | **Blast radius** | **Flexible** — one PR may propose edits across **multiple** doc pages. |
| 4 | **Autonomy** | **Always human-approved.** No auto-writes, ever. |
| 5 | **Staleness** | The planner **may conclude "nothing to update"** and close the run clean. |
| 6 | **Branch awareness** | The doc body reflects **shipped** state; unreleased branch changes live under a **collapsible toggle** (see §4). |

---

## 4. Branch-aware doc model (the core v2 design)

**Problem:** "watch all branches" naively means a merge into `dev` edits the live
doc — which now describes code that isn't in production. For a tool whose pitch is
"keep docs *honest*," documenting unreleased state is the one unacceptable failure.

**Design:** use Notion's native **toggle block** as progressive disclosure.

- **Release-branch merge** (base branch == `RELEASE_BRANCH`, default `main`):
  the patch edits the **doc body** — production truth, honest by default.
- **Non-release-branch merge** (any other base branch): the patch is written as a
  **delta** (only what *would* change when it ships — not a full parallel doc)
  under **one grouped toggle** titled `▸ Pending changes`, with each entry labeled
  by branch and PR number. One shared toggle, not one-per-branch (avoids a forest
  of arrows).
- **Graduation on ship** (deferred — see §7): when that work later reaches the
  release branch, its pending entry is removed and the change flows into the body.
  Branch-awareness and staleness-cleanup are the same mechanism.

**Why delta, not full doc:** the real cost in this system is **LLM output tokens**.
A full parallel doc means the model regenerates a whole page per branch per merge;
a delta regenerates only the changed slice. Same reason it reads better for a human.

**Why toggles:** it is a native Notion primitive, so the output feels like a real
Notion feature; and the default (collapsed) view stays clean while capturing full
all-branch context one click away.

---

## 5. Contract & data-model changes

- **`schemas/github.ts`** — capture `pull_request.base.ref` and `head.ref`
  (payload already carries them; schema currently drops them).
- **`PullRequestContext`** and **`AgentRun`** — add `baseBranch`, `headBranch`.
- **`AgentRunStatus`** enum — add **`no_changes`** terminal state (Prisma migration).
- **`DocPatchPlan`** — add `sourceBranch: string` and
  `placement: "body" | "pending"` (derived server-side from `baseBranch` vs
  `RELEASE_BRANCH`; stored for audit, never trusted from the model).
- **`integrations/notion.ts`** — add a `toggle(title, children)` block builder and
  an `ensurePendingToggle(pageId)` helper (find-or-create the grouped toggle).
- **`writer.ts`** — branch on `plan.placement`: `body` → current behavior;
  `pending` → append the delta as children of the page's `▸ Pending changes`
  toggle, prefixed with a `branch@pr` label.
- **Config** — `RELEASE_BRANCH` (default `main`) and `DOC_TRIGGER_PATHS`
  (glob allowlist, e.g. `apps/api/**,packages/shared/**`) in `env.ts` / `.env.example`.

**Grounding preserved:** the model still never sets identity or placement fields;
the server forces `runId`, `targetPageId`, `sourceBranch`, and `placement`
(same pattern as `planner.ts:assemble`).

---

## 6. Implementation plan (PR-sized, ordered)

Workflow is PRs-only (branch → PR → green CI → squash-merge). Each chunk is one PR.

### PR-A — Branch capture (foundation, no behavior change)
- Add `base.ref`/`head.ref` to `github.ts`; thread into `createRunFromEvent`.
- Add `baseBranch`/`headBranch` to `AgentRun` (migration) and `PullRequestContext`.
- Store + log the branch on every run; surface it in the run UI.
- **Accept:** a merged PR into any branch records its base/head branch; visible on `/runs/:id`. Everything downstream still behaves as before.

### PR-B — Path-filter gating
- Add `DOC_TRIGGER_PATHS` config (glob allowlist; empty = allow all, preserves current behavior).
- In `createRunFromEvent` (or immediately after PR fetch), skip runs whose changed files match no configured path; return a clean `ignored` outcome and log why.
- **Accept:** a PR touching only unlisted paths is ignored with a logged reason; a PR touching a listed path runs. Default config = no behavior change.

### PR-C — Multi-page planning
- In `agent.worker.ts`, loop the retrieved docs (above a score threshold, capped) and generate **one `PatchPlan` per page** instead of only `related[0]`.
- Update `/runs/:id` + approval UI to list/approve multiple plans per run.
- **Accept:** a PR that legitimately affects two docs yields two independently-approvable plans under one run.

### PR-D — No-op close path
- Let the planner return "no changes needed" (empty actions + explicit signal); worker sets run status **`no_changes`** and logs a clean close instead of `failed`.
- Distinguish `no_changes` (healthy) from `failed` (error) in the UI.
- **Accept:** a PR with no doc impact ends `no_changes`, not `failed`, and proposes nothing.

### PR-E — Toggle + branch placement (the headline feature)
- Add `toggle()` + `ensurePendingToggle()` to `integrations/notion.ts`.
- Add `sourceBranch`/`placement` to `DocPatchPlan`; derive server-side.
- In `writer.ts`, route `pending` placements into the grouped `▸ Pending changes` toggle with a `branch@pr` label; `body` placements unchanged.
- Show placement (body vs pending) in the approval UI so the reviewer knows where it lands.
- **Accept:** a merge into `main` edits the body; a merge into `dev` appears as a labeled delta under one `▸ Pending changes` toggle on the same page.

### PR-F — Graduation on ship (deferred)
- When a non-release branch's work reaches the release branch, remove its pending toggle entries and flow the change into the body.
- Trickiest piece (mapping "this pending delta has now shipped"); not required for the demo. Ship A–E first.

**Dependency order:** A → (B, C, D independent) → E (needs A) → F (needs A+E).

---

## 7. Non-goals / deferred

- **Graduation automation (PR-F)** — deferred; MVP can leave pending entries until manually cleared.
- **Auto-approval of trivial patches** — explicitly rejected; the always-approve stance is the trust story.
- **Metadata sync (PR/issue rows in a database)** — that is the native connection's job; Shadow Notino stays in the doc-content lane.
- **Full-diff to the model** — still summarized excerpts only, never the raw diff.
