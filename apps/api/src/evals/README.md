# Prompt-reliability eval

Measures how *dependably* the planner prompt behaves, not whether one output looks
good. An LLM is nondeterministic, so every number here is a **rate over repeated
runs** — the only form of evidence that says anything about production behavior.

```bash
pnpm eval:prompts        # 5 runs per case (25 plans)
pnpm eval:prompts 10     # 10 runs per case (50 plans)
```

Needs only `ANTHROPIC_API_KEY` in `.env`. No Postgres, Redis, Notion, or GitHub —
`generatePatchPlan()` takes an injectable `ModelCaller`, so the harness drives the
real prompt with the real schema and nothing else live.

## What it measures

| Metric | Question it answers |
|---|---|
| **Schema validity** (first attempt / after retry) | Does the model reliably produce JSON that passes `DocPatchPlanSchema`? The split shows how much work the retry-on-invalid path is actually doing. |
| **Heading grounding** | Is every `targetHeading` one we supplied? An invented heading means the writer silently falls back to page-end — a misplacement bug, not a crash. |
| **No-op accuracy** | On a formatting-only or pure-refactor PR, does it correctly return `[]`? Measures both false positives (noise the reviewer must reject) and false negatives (drift that goes undetected). |
| **Injection resistance** | On the hostile fixture, do all four defenses hold — schema, forced `targetPageId`, grounded headings, no injected text in the output? |
| **Latency p50 / p95** | Wall-clock per plan, including any retry. |

## Cases

| Case | Expected | Probes |
|---|---|---|
| `relevant-api-change` | actions | New query param + response field — must propose edits |
| `relevant-config-change` | actions | New env var on a different doc shape |
| `irrelevant-cosmetic` | no actions | Prettier-only diff — must decline |
| `internal-refactor` | no actions | Large diff, zero user-visible change — the harder decline |
| `injection-hostile` | resistance | Injection payloads in both the body and the diff |

## Reading the output

Progress marks: `✓` valid first try · `↻` needed the retry · `✗` invalid JSON twice
· `⚠` never reached the model.

Runs that fail *before* the model answers (billing, 429, network) are classified
`api` and **excluded from every rate** — an unreachable API says nothing about
prompt quality, and counting it as a schema failure would understate the prompt.
Three consecutive API failures abort the run rather than burn the matrix.

Each run writes a full JSON record to `apps/api/eval-results/`, including per-run
action types, confidence, and any deviation — so a reported number can be traced
back to the run that produced it.

## Honest limits

- Ground truth is hand-labeled across 5 cases. This is a smoke-grade eval, not a
  benchmark; treat the rates as directional on this fixture set.
- Retrieval quality is **not** measured — `relatedDocs` is fixed per case, so the
  pgvector search path is deliberately held constant.
- Numbers are model- and prompt-specific. Re-run after changing either; the model
  id is recorded in every results file.
