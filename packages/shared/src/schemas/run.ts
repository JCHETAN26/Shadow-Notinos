import { z } from "zod";

/**
 * Lifecycle of an agent run. Mirrors the Notion "Agent Runs" DB Status select
 * and drives the status timeline in the approval UI.
 */
export const AgentRunStatusSchema = z.enum([
  "queued",
  "fetching_pr",
  "indexing",
  "searching",
  "planning",
  "waiting_approval",
  "applying",
  "applied",
  "rejected",
  "failed",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  repo: z.string(),
  prNumber: z.number(),
  prTitle: z.string(),
  prUrl: z.string(),
  author: z.string().nullable().optional(),
  status: AgentRunStatusSchema,
  diffSummary: z.string().nullable().optional(),
  impactSummary: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

/** Canonical names of audit-log events. See SYSTEM_PROMPT.md rule #5. */
export const RunEventTypeSchema = z.enum([
  "webhook_received",
  "pr_fetched",
  "docs_searched",
  "patch_generated",
  "patch_approved",
  "patch_rejected",
  "block_write_started",
  "block_write_completed",
  "write_failed",
  "run_completed",
  "run_failed",
]);
export type RunEventType = z.infer<typeof RunEventTypeSchema>;
