import { Worker } from "bullmq";
import { AGENT_QUEUE_NAME, type AgentJobData } from "@shadow/shared";
import { prisma } from "../db/prisma.js";
import { connection } from "../queue.js";
import { logRunEvent } from "../services/audit.js";

/**
 * The agent pipeline. Phase 1 only wires the queue end-to-end; later phases
 * fill in: fetch PR context (4) → index/search Notion (5) → plan patch (6),
 * after which the run waits for human approval before the writer runs (8).
 */
export async function processAgentJob(data: AgentJobData): Promise<void> {
  const { runId, repo, prNumber } = data;
  console.log(`[worker] processing run ${runId} for ${repo}#${prNumber}`);

  // Placeholder until Phase 4+. Mark the run as waiting so the pipeline is visible.
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "fetching_pr" },
  });
  await logRunEvent(runId, "pr_fetched", "Worker received job (pipeline stub)");
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
