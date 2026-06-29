import type { RunEventType } from "@shadow/shared";
import { prisma } from "../db/prisma.js";

/**
 * Append an auditable event to a run's timeline. Every important step in the
 * pipeline records one of these — see SYSTEM_PROMPT.md rule #5 (Preserve auditability).
 */
export async function logRunEvent(
  agentRunId: string,
  type: RunEventType,
  message?: string,
  data?: unknown,
): Promise<void> {
  await prisma.runEvent.create({
    data: {
      agentRunId,
      type,
      message,
      data: data === undefined ? undefined : (data as object),
    },
  });
  // Mirror to stdout so the demo is legible while watching the API logs.
  console.log(`[run ${agentRunId}] ${type}${message ? ` — ${message}` : ""}`);
}
