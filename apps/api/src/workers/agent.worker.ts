import { Worker } from "bullmq";
import { AGENT_QUEUE_NAME, type AgentJobData } from "@shadow/shared";
import { prisma } from "../db/prisma.js";
import { connection } from "../queue.js";
import { logRunEvent } from "../services/audit.js";
import { getPRContext } from "../services/github/pr-context.js";
import { searchDocs, getPageHeadings } from "../services/notion/search.js";
import { generatePatchPlan } from "../agents/planner.js";
import { savePatchPlan } from "../services/patch-plans.js";
import { env } from "../env.js";
import type { PullRequestContext } from "@shadow/shared";

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

  // --- Phase 4: fetch and store PR context ---
  await prisma.agentRun.update({ where: { id: runId }, data: { status: "fetching_pr" } });
  try {
    const prContext = await getPRContext({
      repo: run.repo,
      prNumber: run.prNumber,
      prTitle: run.prTitle,
      prUrl: run.prUrl,
      author: run.author,
    });

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

    // --- Phase 5: retrieve related Notion docs ---
    const query = buildSearchQuery(prContext);
    const related = await searchDocs(query, 5);
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

    // --- Phase 6: generate the documentation patch plan ---
    const target = related[0];
    if (!target) {
      await prisma.agentRun.update({ where: { id: runId }, data: { status: "failed" } });
      await logRunEvent(runId, "run_failed", "No related docs to plan against — seed + index the workspace first.");
      return;
    }
    if (!env.anthropicApiKey) {
      await prisma.agentRun.update({ where: { id: runId }, data: { status: "failed" } });
      await logRunEvent(runId, "run_failed", "ANTHROPIC_API_KEY is not set — cannot run the planner.");
      return;
    }

    const headings = await getPageHeadings(target.pageId);
    const plan = await generatePatchPlan({
      runId,
      pr: prContext,
      relatedDocs: related,
      targetPage: { pageId: target.pageId, title: target.title, headings },
    });

    const planId = await savePatchPlan(plan);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: "waiting_approval", impactSummary: plan.summary },
    });
    await logRunEvent(
      runId,
      "patch_generated",
      `Proposed ${plan.actions.length} action(s) for "${plan.targetPageTitle}" (confidence ${plan.confidence.toFixed(2)})`,
      { planId, actions: plan.actions.map((a) => a.type), risks: plan.risks },
    );
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
