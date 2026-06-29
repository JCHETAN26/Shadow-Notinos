import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const runsRouter: Router = Router();

// GET /api/runs — list agent runs, newest first.
runsRouter.get("/runs", async (_req, res) => {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { patchPlans: true } } },
  });
  res.json({ runs });
});

// GET /api/runs/:id — full run detail for the approval UI.
runsRouter.get("/runs/:id", async (req, res) => {
  const run = await prisma.agentRun.findUnique({
    where: { id: req.params.id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      patchPlans: {
        orderBy: { createdAt: "desc" },
        include: { actions: true },
      },
    },
  });
  if (!run) {
    res.status(404).json({ error: `Agent run ${req.params.id} not found.` });
    return;
  }
  res.json({ run });
});
