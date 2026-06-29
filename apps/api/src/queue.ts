import { Queue } from "bullmq";
import IORedis from "ioredis";
import { AGENT_QUEUE_NAME, type AgentJobData } from "@shadow/shared";
import { env } from "./env.js";

// BullMQ requires maxRetriesPerRequest: null on the shared connection.
export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export const agentQueue = new Queue<AgentJobData>(AGENT_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
