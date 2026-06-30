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

// POST /api/runs/:id/approve — record approval. The Notion write runs in Phase 8.
patchesRouter.post("/runs/:id/approve", async (req, res, next) => {
  try {
    const plan = await latestPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: "No patch plan to approve." });
      return;
    }
    if (plan.status !== "proposed") {
      res.status(409).json({ error: `Patch is already ${plan.status}.` });
      return;
    }

    await prisma.patchPlan.update({
      where: { id: plan.id },
      data: { status: "approved", approvedAt: new Date() },
    });
    await prisma.agentRun.update({ where: { id: req.params.id }, data: { status: "applying" } });
    await logRunEvent(req.params.id, "patch_approved", `Approved ${plan.id}`);

    // Apply the approved actions to Notion (Phase 8). Synchronous so the UI
    // shows the write outcome immediately.
    try {
      const result = await applyPatchPlan(plan.id);
      res.json({ ok: result.ok, planId: plan.id, status: result.ok ? "applied" : "failed", result });
    } catch (writeErr) {
      await prisma.patchPlan.update({ where: { id: plan.id }, data: { status: "failed" } });
      await prisma.agentRun.update({ where: { id: req.params.id }, data: { status: "failed" } });
      await logRunEvent(req.params.id, "write_failed", (writeErr as Error).message);
      res.status(502).json({ ok: false, planId: plan.id, error: (writeErr as Error).message });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/runs/:id/reject
patchesRouter.post("/runs/:id/reject", async (req, res, next) => {
  try {
    const plan = await latestPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: "No patch plan to reject." });
      return;
    }
    await prisma.patchPlan.update({ where: { id: plan.id }, data: { status: "rejected" } });
    await prisma.agentRun.update({ where: { id: req.params.id }, data: { status: "rejected" } });
    await logRunEvent(req.params.id, "patch_rejected", `Rejected ${plan.id}`);
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
