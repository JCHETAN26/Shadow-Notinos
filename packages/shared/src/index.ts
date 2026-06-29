export * from "./schemas/patch.js";
export * from "./schemas/github.js";
export * from "./schemas/notion.js";
export * from "./schemas/run.js";

/** BullMQ queue + job names, shared between the API producer and the worker. */
export const AGENT_QUEUE_NAME = "shadow-agent";
export const AGENT_JOB_NAME = "process-merged-pr";

export interface AgentJobData {
  runId: string;
  repo: string;
  prNumber: number;
}
