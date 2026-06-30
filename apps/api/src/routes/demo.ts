import { Router } from "express";
import { createRunFromEvent } from "../services/runs.js";
import { SAMPLE_MERGED_PR } from "../fixtures/sample-pr-merged.js";
import { prisma } from "../db/prisma.js";
import { verifyWorkspace } from "../services/notion/seed.js";
import { indexAllEngineeringDocs } from "../services/notion/indexer.js";

export const demoRouter: Router = Router();

// POST /api/demo/verify — confirm the Notion workspace databases are set up.
demoRouter.post("/demo/verify", async (_req, res, next) => {
  try {
    const issues = await verifyWorkspace();
    res.json({ ok: issues.length === 0, issues });
  } catch (err) {
    next(err);
  }
});

// POST /api/demo/index — (re)index the Engineering Docs into pgvector.
demoRouter.post("/demo/index", async (_req, res, next) => {
  try {
    const results = await indexAllEngineeringDocs();
    const chunks = results.reduce((n, r) => n + r.chunks, 0);
    res.json({ ok: true, pages: results.length, chunks });
  } catch (err) {
    next(err);
  }
});

// POST /api/demo/reset — clear agent runs (cascades to events + patches).
demoRouter.post("/demo/reset", async (_req, res, next) => {
  try {
    const { count } = await prisma.agentRun.deleteMany({});
    res.json({ ok: true, deleted: count });
  } catch (err) {
    next(err);
  }
});

/**
 * Replay a merged-PR event locally without a real GitHub delivery.
 * POST a `pull_request` payload in the body, or send an empty body to replay
 * the built-in sample (PR #184).
 */
demoRouter.post("/demo/replay-github-event", async (req, res, next) => {
  try {
    const hasBody = req.body && Object.keys(req.body).length > 0;
    const payload = hasBody ? req.body : SAMPLE_MERGED_PR;

    const outcome = await createRunFromEvent(payload);
    if (!outcome.created) {
      res.status(422).json({ ok: false, reason: outcome.reason });
      return;
    }
    res.status(202).json({ ok: true, runId: outcome.runId, replayed: !hasBody });
  } catch (err) {
    next(err);
  }
});
