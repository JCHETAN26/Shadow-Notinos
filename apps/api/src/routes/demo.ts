import { Router } from "express";
import { createRunFromEvent } from "../services/runs.js";
import { SAMPLE_MERGED_PR } from "../fixtures/sample-pr-merged.js";

export const demoRouter: Router = Router();

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
