import { Worker } from "bullmq";
import { AGENT_QUEUE_NAME, type AgentJobData } from "@shadow/shared";
import { prisma } from "../db/prisma.js";
import { connection } from "../queue.js";
import { logRunEvent } from "../services/audit.js";
import { getPRContext } from "../services/github/pr-context.js";

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
      data: {
        prContext,
        diffSummary: prContext.diffSummary,
        // Next stages (search → plan) land in later phases; park here for now.
        status: "searching",
      },
    });
    await logRunEvent(
      runId,
      "pr_fetched",
      `Fetched ${prContext.filesChanged.length} changed file(s), ${prContext.commits.length} commit(s)`,
      { files: prContext.filesChanged.map((f) => f.filename) },
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
