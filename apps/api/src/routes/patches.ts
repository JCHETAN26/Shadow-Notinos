import { Router } from "express";
import { DocPatchPlanSchema } from "@shadow/shared";
import { prisma } from "../db/prisma.js";
import { logRunEvent } from "../services/audit.js";
import { applyPatchPlan } from "../services/notion/writer.js";

export const patchesRouter: Router = Router();

/** Latest patch plan for a run (most recent first). */
async function latestPlan(runId: string) {
  return prisma.patchPlan.findFirst({
    where: { agentRunId: runId },
    orderBy: { createdAt: "desc" },
    include: { actions: true },
  });
}

// GET /api/runs/:id/patch
patchesRouter.get("/runs/:id/patch", async (req, res, next) => {
  try {
    const plan = await latestPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: "No patch plan for this run yet." });
      return;
    }
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

/**
 * Reconcile a run's status from its plans. A run may hold several plans
 * (multi-page), so it's only terminal once none are still proposed.
 */
export async function recomputeRunStatus(runId: string): Promise<void> {
  const plans = await prisma.patchPlan.findMany({ where: { agentRunId: runId } });
  let status: "waiting_approval" | "applied" | "failed" | "rejected";
  if (plans.some((p) => p.status === "proposed")) status = "waiting_approval";
  else if (plans.some((p) => p.status === "failed")) status = "failed";
  else if (plans.some((p) => p.status === "applied")) status = "applied";
  else status = "rejected";
  await prisma.agentRun.update({ where: { id: runId }, data: { status } });
}

// POST /api/patches/:planId/approve — approve one plan and write it to Notion.
patchesRouter.post("/patches/:planId/approve", async (req, res, next) => {
  try {
    const plan = await prisma.patchPlan.findUnique({ where: { id: req.params.planId } });
    if (!plan) {
      res.status(404).json({ error: "Patch plan not found." });
      return;
    }
    if (plan.status !== "proposed") {
      res.status(409).json({ error: `Patch is already ${plan.status}.` });
      return;
    }
    const runId = plan.agentRunId;

    await prisma.patchPlan.update({
      where: { id: plan.id },
      data: { status: "approved", approvedAt: new Date() },
    });
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "applying" } });
    await logRunEvent(runId, "patch_approved", `Approved ${plan.id}`);

    // Apply the approved actions to Notion. Synchronous so the UI shows the
    // outcome immediately; run status is reconciled across all of the run's plans.
    try {
      const result = await applyPatchPlan(plan.id);
      await recomputeRunStatus(runId);
      res.json({ ok: result.ok, planId: plan.id, result });
    } catch (writeErr) {
      await prisma.patchPlan.update({ where: { id: plan.id }, data: { status: "failed" } });
      await recomputeRunStatus(runId);
      await logRunEvent(runId, "write_failed", (writeErr as Error).message);
      res.status(502).json({ ok: false, planId: plan.id, error: (writeErr as Error).message });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/patches/:planId/reject
patchesRouter.post("/patches/:planId/reject", async (req, res, next) => {
  try {
    const plan = await prisma.patchPlan.findUnique({ where: { id: req.params.planId } });
    if (!plan) {
      res.status(404).json({ error: "Patch plan not found." });
      return;
    }
    if (plan.status !== "proposed") {
      res.status(409).json({ error: `Patch is already ${plan.status}.` });
      return;
    }
    const runId = plan.agentRunId;
    await prisma.patchPlan.update({ where: { id: plan.id }, data: { status: "rejected" } });
    await recomputeRunStatus(runId);
    await logRunEvent(runId, "patch_rejected", `Rejected ${plan.id}`);
    res.json({ ok: true, planId: plan.id, status: "rejected" });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/runs/:id/patch — replace the proposed plan with an edited version.
patchesRouter.patch("/runs/:id/patch", async (req, res, next) => {
  try {
    const plan = await latestPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: "No patch plan to edit." });
      return;
    }
    if (plan.status !== "proposed") {
      res.status(409).json({ error: `Cannot edit a ${plan.status} patch.` });
      return;
    }

    // Force identity fields so an edit can't retarget a different page.
    const candidate = {
      ...(req.body ?? {}),
      runId: req.params.id,
      targetPageId: plan.targetPageId,
      targetPageTitle: (plan.patchJson as { targetPageTitle?: string }).targetPageTitle ?? "",
    };
    const parsed = DocPatchPlanSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res.status(400).json({
        error: `Invalid patch JSON. Validation failed at ${issue?.path.join(".") || "(root)"}: ${issue?.message}`,
      });
      return;
    }

    const edited = parsed.data;
    await prisma.$transaction([
      prisma.patchAction.deleteMany({ where: { patchPlanId: plan.id } }),
      prisma.patchPlan.update({
        where: { id: plan.id },
        data: {
          patchJson: edited,
          actions: {
            create: edited.actions.map((a) => ({
              actionType: a.type,
              headingMatch: "targetHeading" in a ? a.targetHeading : null,
              notionPayload: a,
              status: "pending",
            })),
          },
        },
      }),
    ]);
    await logRunEvent(req.params.id, "patch_generated", `Patch edited (${edited.actions.length} actions)`);
    res.json({ ok: true, planId: plan.id });
  } catch (err) {
    next(err);
  }
});
