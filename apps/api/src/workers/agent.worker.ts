import { Worker } from "bullmq";
import { AGENT_QUEUE_NAME, type AgentJobData } from "@shadow/shared";
import { prisma } from "../db/prisma.js";
import { connection } from "../queue.js";
import { logRunEvent } from "../services/audit.js";
import { getPRContext, hasMeaningfulDiff } from "../services/github/pr-context.js";
import { searchDocs, getPageHeadings } from "../services/notion/search.js";
import { parseTriggerPaths, matchesAnyPath } from "../services/github/path-filter.js";
import { getTenantCredentials } from "../services/tenants.js";
import { generatePatchPlan } from "../agents/planner.js";
import { savePatchPlan } from "../services/patch-plans.js";
import type { PullRequestContext } from "@shadow/shared";

/** Cap on how many doc pages one PR may propose against (bounds LLM calls). */
const MAX_TARGET_PAGES = 3;

/** Build a retrieval query from the parts of a PR most likely to name affected docs. */
function buildSearchQuery(pr: PullRequestContext): string {
  const files = pr.filesChanged.map((f) => f.filename).join(" ");
  return [pr.title, pr.labels.join(" "), files].filter(Boolean).join(" ");
}

/**
 * The agent pipeline. Implemented incrementally:
 *   (4) fetch PR context → (5) index/search Notion → (6) plan patch
 * after which the run waits for human approval before the writer runs (8).
 */
export async function processAgentJob(data: AgentJobData): Promise<void> {
  const { runId, repo, prNumber } = data;
  console.log(`[worker] processing run ${runId} for ${repo}#${prNumber}`);

  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Agent run ${runId} not found.`);

  // BYOK: process this run with its tenant's own credentials (env fallback).
  const creds = await getTenantCredentials(run.tenantId);

  // --- Phase 4: fetch and store PR context ---
  await prisma.agentRun.update({ where: { id: runId }, data: { status: "fetching_pr" } });
  try {
    const prContext = await getPRContext({
      repo: run.repo,
      prNumber: run.prNumber,
      prTitle: run.prTitle,
      prUrl: run.prUrl,
      author: run.author,
      baseBranch: run.baseBranch,
      headBranch: run.headBranch,
    }, { githubToken: creds.githubToken });

    await prisma.agentRun.update({
      where: { id: runId },
      data: { prContext, diffSummary: prContext.diffSummary, status: "searching" },
    });
    await logRunEvent(
      runId,
      "pr_fetched",
      `Fetched ${prContext.filesChanged.length} changed file(s), ${prContext.commits.length} commit(s)`,
      { files: prContext.filesChanged.map((f) => f.filename) },
    );

    // --- Ghost PR guard: don't pay the LLM for empty or binary-only diffs ---
    if (!hasMeaningfulDiff(prContext.filesChanged)) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "no_changes", impactSummary: "No textual code changes to document (empty or binary-only PR)." },
      });
      await logRunEvent(
        runId,
        "run_skipped",
        "Skipped before the planner: no meaningful textual diff (empty or binary-only PR).",
      );
      return;
    }

    // --- Path gating: skip PRs that touch nothing in the configured allowlist ---
    const triggerPaths = parseTriggerPaths(creds.docTriggerPaths);
    const filenames = prContext.filesChanged.map((f) => f.filename);
    if (!matchesAnyPath(filenames, triggerPaths)) {
      await prisma.agentRun.update({ where: { id: runId }, data: { status: "no_changes" } });
      await logRunEvent(
        runId,
        "run_skipped",
        `Skipped: no changed files match DOC_TRIGGER_PATHS (${triggerPaths.join(", ")})`,
        { triggerPaths, filenames },
      );
      return;
    }

    // --- Phase 5: retrieve related Notion docs ---
    const query = buildSearchQuery(prContext);
    const related = await searchDocs(query, run.tenantId, 5);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { relatedDocs: related, status: "planning" },
    });
    await logRunEvent(
      runId,
      "docs_searched",
      related.length > 0
        ? `Found ${related.length} related doc(s): ${related.map((r) => r.title).join(", ")}`
        : "No related docs found (is the workspace seeded + indexed?)",
      { query, pages: related.map((r) => ({ title: r.title, score: r.score })) },
    );

    // --- Phase 6: generate a patch plan per affected doc page (multi-page) ---
    if (related.length === 0) {
      await prisma.agentRun.update({ where: { id: runId }, data: { status: "failed" } });
      await logRunEvent(runId, "run_failed", "No related docs to plan against — seed + index the workspace first.");
      return;
    }
    if (!creds.anthropicApiKey) {
      await prisma.agentRun.update({ where: { id: runId }, data: { status: "failed" } });
      await logRunEvent(runId, "run_failed", "No Anthropic API key for this tenant — cannot run the planner.");
      return;
    }

    // Plan against the most-relevant pages: always the top hit, plus any others
    // scoring within half of it (bounds LLM calls; the planner no-ops the rest).
    const topScore = related[0]!.score;
    const targets = related
      .slice(0, MAX_TARGET_PAGES)
      .filter((r, i) => i === 0 || r.score >= topScore * 0.5);

    const proposed: Array<{ title: string; actions: number }> = [];
    for (const target of targets) {
      const headings = await getPageHeadings(target.pageId, run.tenantId);
      const plan = await generatePatchPlan({
        runId,
        pr: prContext,
        relatedDocs: related,
        targetPage: { pageId: target.pageId, title: target.title, headings },
        baseBranch: prContext.baseBranch ?? run.baseBranch,
        releaseBranch: creds.releaseBranch,
        anthropicApiKey: creds.anthropicApiKey,
      });

      // Per page, the planner may conclude nothing needs changing — skip it.
      if (plan.actions.length === 0) {
        await logRunEvent(
          runId,
          "run_no_changes",
          `No changes needed for "${target.title}": ${plan.summary}`,
          { confidence: plan.confidence },
        );
        continue;
      }

      const planId = await savePatchPlan(plan);
      proposed.push({ title: plan.targetPageTitle, actions: plan.actions.length });
      await logRunEvent(
        runId,
        "patch_generated",
        `Proposed ${plan.actions.length} action(s) for "${plan.targetPageTitle}" (confidence ${plan.confidence.toFixed(2)})`,
        { planId, actions: plan.actions.map((a) => a.type), risks: plan.risks },
      );
    }

    // Every candidate page came back clean → close the run as no_changes.
    if (proposed.length === 0) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "no_changes", impactSummary: "No documentation changes needed for this PR." },
      });
      await logRunEvent(runId, "run_no_changes", "No documentation changes needed for this PR.");
      return;
    }

    const impactSummary =
      proposed.length === 1
        ? `${proposed[0]!.actions} change(s) → ${proposed[0]!.title}`
        : `${proposed.length} pages: ${proposed.map((p) => p.title).join(", ")}`;
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: "waiting_approval", impactSummary },
    });
  } catch (err) {
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "failed" } });
    await logRunEvent(runId, "run_failed", (err as Error).message);
    throw err;
  }
}

/** Create and start the BullMQ worker. Shared by the standalone runner and the dev API process. */
export function createAgentWorker(): Worker<AgentJobData> {
  const worker = new Worker<AgentJobData>(
    AGENT_QUEUE_NAME,
    async (job) => processAgentJob(job.data),
    { connection, concurrency: 2 },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed (run ${job.data.runId})`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  console.log(`👷 shadow-notino worker listening on queue "${AGENT_QUEUE_NAME}"`);
  return worker;
}
