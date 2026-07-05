import { Router, raw } from "express";
import { verifyGitHubSignature } from "../integrations/github/verify.js";
import { createRunFromEvent } from "../services/runs.js";
import { resolveTenantForRepo, getTenantCredentials } from "../services/tenants.js";

export const webhooksRouter: Router = Router();

// GitHub webhook. Uses a raw body parser so the HMAC signature can be verified
// against the exact bytes GitHub sent. Mounted before the global JSON parser.
webhooksRouter.post(
  "/webhooks/github",
  raw({ type: "*/*", limit: "5mb" }),
  async (req, res, next) => {
    try {
      const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

      const eventType = req.header("x-github-event");
      if (eventType !== "pull_request") {
        res.status(200).json({ ok: true, ignored: `event=${eventType ?? "unknown"}` });
        return;
      }

      // Route by repo → tenant BEFORE verifying, since the webhook secret is
      // per-tenant. Reading repo from the body doesn't affect raw-bytes verification.
      let repoFullName: string | undefined;
      try {
        repoFullName = JSON.parse(rawBody.toString("utf8"))?.repository?.full_name;
      } catch {
        /* fall through to 400 */
      }
      if (!repoFullName) {
        res.status(400).json({ error: "Could not read repository.full_name from payload." });
        return;
      }

      const tenantId = await resolveTenantForRepo(repoFullName);
      const creds = await getTenantCredentials(tenantId);

      if (!creds.githubWebhookSecret) {
        res.status(503).json({
          error:
            "No webhook secret configured for this repo's tenant. Connect the repo in onboarding (or set GITHUB_WEBHOOK_SECRET in .env for the default tenant).",
        });
        return;
      }

      const signature = req.header("x-hub-signature-256");
      if (!verifyGitHubSignature(rawBody, signature, creds.githubWebhookSecret)) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }

      const payload = JSON.parse(rawBody.toString("utf8"));
      const outcome = await createRunFromEvent(payload, { tenantId });

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
