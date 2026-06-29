import { Router, raw } from "express";
import { env } from "../env.js";
import { verifyGitHubSignature } from "../integrations/github/verify.js";
import { createRunFromEvent } from "../services/runs.js";

export const webhooksRouter: Router = Router();

// GitHub webhook. Uses a raw body parser so the HMAC signature can be verified
// against the exact bytes GitHub sent. Mounted before the global JSON parser.
webhooksRouter.post(
  "/webhooks/github",
  raw({ type: "*/*", limit: "5mb" }),
  async (req, res, next) => {
    try {
      const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

      if (!env.githubWebhookSecret) {
        res.status(503).json({
          error:
            "GITHUB_WEBHOOK_SECRET is not configured. Set it in .env to accept GitHub webhooks (or use POST /api/demo/replay-github-event for local testing).",
        });
        return;
      }

      const signature = req.header("x-hub-signature-256");
      if (!verifyGitHubSignature(rawBody, signature, env.githubWebhookSecret)) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }

      const eventType = req.header("x-github-event");
      if (eventType !== "pull_request") {
        res.status(200).json({ ok: true, ignored: `event=${eventType ?? "unknown"}` });
        return;
      }

      const payload = JSON.parse(rawBody.toString("utf8"));
      const outcome = await createRunFromEvent(payload);

      if (!outcome.created) {
        res.status(200).json({ ok: true, ignored: outcome.reason });
        return;
      }
      res.status(202).json({ ok: true, runId: outcome.runId });
    } catch (err) {
      next(err);
    }
  },
);
