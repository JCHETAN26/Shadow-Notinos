/**
 * Prompt-reliability eval harness.
 *
 * Runs the real planner prompt against a fixed set of PR fixtures, N times each,
 * and reports the rates that matter for a nondeterministic component:
 *
 *   - schema validity   — how often the model's JSON parses against DocPatchPlan,
 *                         split by first attempt vs. after the retry-on-invalid
 *   - heading grounding — how often every targetHeading is one we actually supplied
 *   - no-op accuracy    — how often an empty plan matches ground truth (both ways)
 *   - injection resist. — how often the hostile fixture's defenses hold
 *   - latency           — p50 / p95 per plan
 *
 * No Postgres, Redis, Notion, or GitHub required: the planner takes an injectable
 * ModelCaller, so the only live dependency is the Anthropic API.
 *
 * Usage:  pnpm eval:prompts [runs]     (default 5 runs per case)
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocPatchPlan } from "@shadow/shared";
import { generatePatchPlan, type ModelCaller } from "../agents/planner.js";
import { callClaude, CLAUDE_MODEL } from "../integrations/anthropic.js";
import { env } from "../env.js";
import { EVAL_CASES, type EvalCase } from "./cases.js";
import { percentile, pct, scoreGrounding, scoreInjection, scoreNoOp } from "./scoring.js";

interface RunResult {
  case: string;
  run: number;
  ok: boolean;
  /** 1 = valid on the first attempt, 2 = needed the retry, 0 = never parsed. */
  modelCalls: number;
  /**
   * Why the run produced no plan.
   *  - "api"     — the request never reached a response (billing, 429, network).
   *                Excluded from the prompt metrics: it says nothing about the prompt.
   *  - "invalid" — the model answered, but its JSON failed Zod twice.
   */
  failure: "api" | "invalid" | null;
  latencyMs: number;
  actions: number;
  actionTypes: string[];
  confidence: number | null;
  grounded: boolean | null;
  groundedTargets: number;
  ungroundedHeadings: string[];
  noOpCorrect: boolean | null;
  injectionResisted: boolean | null;
  injectionFailures: string[];
  error?: string;
}

/** Drive one case once, timing it and counting how many model calls it took. */
async function runOnce(testCase: EvalCase, run: number): Promise<RunResult> {
  let modelCalls = 0;
  let textResponses = 0;
  const caller: ModelCaller = async (system, user) => {
    modelCalls++;
    const text = await callClaude(system, user);
    textResponses++;
    return text;
  };

  const base: RunResult = {
    case: testCase.name,
    run,
    ok: false,
    modelCalls: 0,
    failure: null,
    latencyMs: 0,
    actions: 0,
    actionTypes: [],
    confidence: null,
    grounded: null,
    groundedTargets: 0,
    ungroundedHeadings: [],
    noOpCorrect: null,
    injectionResisted: null,
    injectionFailures: [],
  };

  const started = Date.now();
  let plan: DocPatchPlan;
  try {
    plan = await generatePatchPlan(
      {
        runId: `eval-${testCase.name}-${run}`,
        pr: testCase.pr,
        relatedDocs: testCase.relatedDocs,
        targetPage: testCase.targetPage,
        baseBranch: testCase.baseBranch,
        releaseBranch: "main",
      },
      caller,
    );
  } catch (err) {
    return {
      ...base,
      modelCalls,
      // No call ever came back with text => the API itself failed, not the prompt.
      failure: textResponses === 0 ? "api" : "invalid",
      latencyMs: Date.now() - started,
      error: (err as Error).message,
    };
  }

  const latencyMs = Date.now() - started;
  const grounding = scoreGrounding(plan, testCase.targetPage.headings);
  const noOp = scoreNoOp(plan, testCase.expected);
  const injection = testCase.hostile ? scoreInjection(plan, testCase) : null;

  return {
    case: testCase.name,
    run,
    ok: true,
    modelCalls,
    failure: null,
    latencyMs,
    actions: plan.actions.length,
    actionTypes: plan.actions.map((a) => a.type),
    confidence: plan.confidence,
    grounded: grounding.grounded,
    groundedTargets: grounding.total,
    ungroundedHeadings: grounding.offenders,
    // The hostile case is scored for resistance, not for action count.
    noOpCorrect: testCase.hostile ? null : noOp.correct,
    injectionResisted: injection ? injection.resisted : null,
    injectionFailures: injection ? injection.failures : [],
  };
}

function summarize(results: RunResult[]) {
  // Runs the API never answered are infrastructure noise, not prompt behavior —
  // they're reported separately and kept out of every rate below.
  const apiErrors = results.filter((r) => r.failure === "api");
  const scored = results.filter((r) => r.failure !== "api");
  const total = scored.length;
  const parsed = scored.filter((r) => r.ok);
  const firstAttempt = parsed.filter((r) => r.modelCalls === 1);

  // Grounding is only meaningful on runs that actually targeted a heading.
  const groundingRuns = parsed.filter((r) => r.groundedTargets > 0);
  const groundedOk = groundingRuns.filter((r) => r.grounded);

  const noOpRuns = parsed.filter((r) => r.noOpCorrect !== null);
  const noOpOk = noOpRuns.filter((r) => r.noOpCorrect);

  const injectionRuns = parsed.filter((r) => r.injectionResisted !== null);
  const injectionOk = injectionRuns.filter((r) => r.injectionResisted);

  const latencies = parsed.map((r) => r.latencyMs);

  return {
    total,
    apiErrors: apiErrors.length,
    parsedOk: parsed.length,
    firstAttemptOk: firstAttempt.length,
    groundingRuns: groundingRuns.length,
    groundedOk: groundedOk.length,
    noOpRuns: noOpRuns.length,
    noOpOk: noOpOk.length,
    injectionRuns: injectionRuns.length,
    injectionOk: injectionOk.length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    modelCallsTotal: results.reduce((sum, r) => sum + r.modelCalls, 0),
  };
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

async function main(): Promise<void> {
  const runs = Number(process.argv[2] ?? 5);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`Invalid run count "${process.argv[2]}". Pass a positive integer.`);
  }
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env — the eval calls the real API.");
  }

  const planned = EVAL_CASES.length * runs;
  console.log(`\n🧪 Prompt-reliability eval`);
  console.log(`   model:  ${CLAUDE_MODEL}`);
  console.log(`   cases:  ${EVAL_CASES.length}`);
  console.log(`   runs:   ${runs} per case (${planned} plans, ≥${planned} API calls)\n`);

  const results: RunResult[] = [];
  /** Bail out rather than burn the whole matrix against an unreachable API. */
  const ABORT_AFTER_CONSECUTIVE_API_ERRORS = 3;
  let consecutiveApiErrors = 0;
  let aborted = false;

  for (const testCase of EVAL_CASES) {
    if (aborted) break;
    process.stdout.write(`   ${pad(testCase.name, 24)} `);
    for (let run = 1; run <= runs; run++) {
      const result = await runOnce(testCase, run);
      results.push(result);
      // ✓ clean · ↻ needed the retry · ✗ invalid JSON · ⚠ never reached the model
      const mark =
        result.failure === "api" ? "⚠" : !result.ok ? "✗" : result.modelCalls > 1 ? "↻" : "✓";
      process.stdout.write(mark);

      consecutiveApiErrors = result.failure === "api" ? consecutiveApiErrors + 1 : 0;
      if (consecutiveApiErrors >= ABORT_AFTER_CONSECUTIVE_API_ERRORS) {
        aborted = true;
        break;
      }
    }
    process.stdout.write("\n");
  }

  if (aborted) {
    console.log(
      `\n   ⚠ Aborted after ${ABORT_AFTER_CONSECUTIVE_API_ERRORS} consecutive API failures —\n` +
        `     no point spending the rest of the matrix. Last error:\n` +
        `     ${results[results.length - 1]!.error}\n`,
    );
  }

  const s = summarize(results);

  console.log(`\n${"─".repeat(72)}`);
  console.log(`Per-case\n`);
  console.log(
    `   ${pad("case", 24)}${pad("expected", 12)}${pad("valid", 8)}${pad("1st-try", 9)}${pad("actions", 9)}conf`,
  );
  for (const testCase of EVAL_CASES) {
    const rows = results.filter((r) => r.case === testCase.name && r.failure !== "api");
    const ok = rows.filter((r) => r.ok);
    const first = ok.filter((r) => r.modelCalls === 1);
    const avgActions = ok.length
      ? (ok.reduce((sum, r) => sum + r.actions, 0) / ok.length).toFixed(1)
      : "—";
    const avgConf = ok.length
      ? (ok.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / ok.length).toFixed(2)
      : "—";
    console.log(
      `   ${pad(testCase.name, 24)}${pad(testCase.expected, 12)}` +
        `${pad(pct(ok.length, rows.length), 8)}${pad(pct(first.length, rows.length), 9)}` +
        `${pad(avgActions, 9)}${avgConf}`,
    );
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log(`Overall\n`);
  console.log(`   schema-valid (after retry)   ${pct(s.parsedOk, s.total)}   (${s.parsedOk}/${s.total})`);
  console.log(`   schema-valid (first attempt) ${pct(s.firstAttemptOk, s.total)}   (${s.firstAttemptOk}/${s.total})`);
  console.log(`   heading grounding            ${pct(s.groundedOk, s.groundingRuns)}   (${s.groundedOk}/${s.groundingRuns} runs that targeted a heading)`);
  console.log(`   no-op accuracy               ${pct(s.noOpOk, s.noOpRuns)}   (${s.noOpOk}/${s.noOpRuns})`);
  console.log(`   injection resistance         ${pct(s.injectionOk, s.injectionRuns)}   (${s.injectionOk}/${s.injectionRuns})`);
  console.log(`   latency p50 / p95            ${(s.p50 / 1000).toFixed(1)}s / ${(s.p95 / 1000).toFixed(1)}s`);
  console.log(`   model calls made             ${s.modelCallsTotal}`);
  if (s.apiErrors > 0) {
    console.log(
      `\n   ⚠ ${s.apiErrors} run(s) never reached the model (API/billing/rate-limit) and are\n` +
        `     excluded from every rate above. Re-run once the API is reachable.`,
    );
  }

  const failures = results.filter((r) => r.failure === "invalid");
  const apiErrors = results.filter((r) => r.failure === "api");
  const misses = results.filter((r) => r.noOpCorrect === false);
  const ungrounded = results.filter((r) => r.ungroundedHeadings.length > 0);
  const breached = results.filter((r) => r.injectionResisted === false);

  if (failures.length || apiErrors.length || misses.length || ungrounded.length || breached.length) {
    console.log(`\n${"─".repeat(72)}`);
    console.log(`Deviations\n`);
    for (const r of failures) console.log(`   ✗ ${r.case} run ${r.run}: invalid JSON twice — ${r.error}`);
    if (apiErrors.length > 0) {
      // These are all the same upstream failure; one line beats N identical ones.
      console.log(`   ⚠ ${apiErrors.length} run(s) failed before reaching the model:`);
      console.log(`     ${apiErrors[0]!.error}`);
    }
    for (const r of misses) {
      console.log(`   ~ ${r.case} run ${r.run}: emitted ${r.actions} action(s) against expectation`);
    }
    for (const r of ungrounded) {
      console.log(`   ~ ${r.case} run ${r.run}: ungrounded heading(s) ${r.ungroundedHeadings.join(", ")}`);
    }
    for (const r of breached) {
      console.log(`   ! ${r.case} run ${r.run}: ${r.injectionFailures.join("; ")}`);
    }
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "../../eval-results", `prompt-eval-${Date.now()}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      { model: CLAUDE_MODEL, runsPerCase: runs, ranAt: new Date().toISOString(), summary: s, results },
      null,
      2,
    ),
  );
  console.log(`\n   results → ${outPath}\n`);
}

main().catch((err) => {
  console.error(`\n❌ ${(err as Error).message}\n`);
  process.exit(1);
});
