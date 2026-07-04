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
  opts: { force?: boolean } = {},
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
  const repo = event.repository.full_name;

  // Idempotency: a merged PR produces exactly one run. Skip duplicate or
  // redelivered webhooks (GitHub can double-fire) so we never launch two
  // overlapping runs that rewrite the same Notion page. A prior *failed* run
  // doesn't block a retry; the demo replay passes force to bypass this.
  if (!opts.force) {
    const existing = await prisma.agentRun.findFirst({
      where: { repo, prNumber: pr.number, status: { not: "failed" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        created: false,
        reason: `Duplicate: run ${existing.id} already exists for ${repo}#${pr.number} (status ${existing.status}).`,
        runId: existing.id,
      };
    }
  }

  const baseBranch = pr.base?.ref ?? null;
  const headBranch = pr.head?.ref ?? null;
  const run = await prisma.agentRun.create({
    data: {
      repo,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.html_url,
      author: pr.user?.login ?? null,
      baseBranch,
      headBranch,
      status: "queued",
    },
  });

  const branchNote = baseBranch ? ` (${headBranch ?? "?"} → ${baseBranch})` : "";
  await logRunEvent(
    run.id,
    "webhook_received",
    `Merged PR ${repo}#${pr.number}: ${pr.title}${branchNote}`,
  );

  const jobData: AgentJobData = {
    runId: run.id,
    repo: event.repository.full_name,
    prNumber: pr.number,
  };
  await agentQueue.add(AGENT_JOB_NAME, jobData, { jobId: run.id });

  return { created: true, runId: run.id };
}
