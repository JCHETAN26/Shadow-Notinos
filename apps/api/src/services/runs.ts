import {
  GitHubMergedPREventSchema,
  type GitHubMergedPREvent,
  AGENT_JOB_NAME,
  type AgentJobData,
} from "@shadow/shared";
import { prisma } from "../db/prisma.js";
import { agentQueue } from "../queue.js";
import { logRunEvent } from "./audit.js";

export interface CreateRunOutcome {
  created: boolean;
  reason?: string;
  runId?: string;
}

/** True only for a PR that was just merged (closed + merged === true). */
export function isMergedPR(event: GitHubMergedPREvent): boolean {
  return event.action === "closed" && event.pull_request.merged === true;
}

/**
 * Turn a GitHub `pull_request` event into an agent run + queued job.
 * Ignores non-PR and non-merged events. Shared by the webhook and the demo replay.
 */
export async function createRunFromEvent(
  payload: unknown,
): Promise<CreateRunOutcome> {
  const parsed = GitHubMergedPREventSchema.safeParse(payload);
  if (!parsed.success) {
    return { created: false, reason: "Not a pull_request event payload." };
  }
  const event = parsed.data;

  if (!isMergedPR(event)) {
    return {
      created: false,
      reason: `Ignoring PR event: action=${event.action}, merged=${event.pull_request.merged ?? false}.`,
    };
  }

  const pr = event.pull_request;
  const run = await prisma.agentRun.create({
    data: {
      repo: event.repository.full_name,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.html_url,
      author: pr.user?.login ?? null,
      status: "queued",
    },
  });

  await logRunEvent(
    run.id,
    "webhook_received",
    `Merged PR ${event.repository.full_name}#${pr.number}: ${pr.title}`,
  );

  const jobData: AgentJobData = {
    runId: run.id,
    repo: event.repository.full_name,
    prNumber: pr.number,
  };
  await agentQueue.add(AGENT_JOB_NAME, jobData, { jobId: run.id });

  return { created: true, runId: run.id };
}
