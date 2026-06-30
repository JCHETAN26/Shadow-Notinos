import type { DocPatchPlan, PatchAction } from "@shadow/shared";
import { prisma } from "../db/prisma.js";

/** The heading an action targets, when it has one. */
function actionHeading(action: PatchAction): string | null {
  return "targetHeading" in action ? action.targetHeading : null;
}

/**
 * Persist a generated plan as a PatchPlan + one PatchAction row per action.
 * Stored in 'proposed' status — nothing is written to Notion until a human approves.
 */
export async function savePatchPlan(plan: DocPatchPlan): Promise<string> {
  const created = await prisma.patchPlan.create({
    data: {
      agentRunId: plan.runId,
      targetPageId: plan.targetPageId,
      status: "proposed",
      patchJson: plan,
      actions: {
        create: plan.actions.map((action) => ({
          actionType: action.type,
          headingMatch: actionHeading(action),
          notionPayload: action,
          status: "pending",
        })),
      },
    },
  });
  return created.id;
}
