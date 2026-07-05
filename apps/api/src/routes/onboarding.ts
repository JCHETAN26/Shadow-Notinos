import { Router } from "express";
import {
  validateKeys,
  listNotionPages,
  setupTenant,
  indexTenantPages,
} from "../services/onboarding.js";

export const onboardingRouter: Router = Router();

/** POST /api/onboarding/validate — live-check the user's Notion + Anthropic keys. */
onboardingRouter.post("/onboarding/validate", async (req, res, next) => {
  try {
    const { notionApiKey, anthropicApiKey } = req.body ?? {};
    if (!notionApiKey || !anthropicApiKey) {
      res.status(400).json({ error: "notionApiKey and anthropicApiKey are required." });
      return;
    }
    res.json(await validateKeys(notionApiKey, anthropicApiKey));
  } catch (err) {
    next(err);
  }
});

/** POST /api/onboarding/pages — list the pages the user's integration can see. */
onboardingRouter.post("/onboarding/pages", async (req, res, next) => {
  try {
    const { notionApiKey } = req.body ?? {};
    if (!notionApiKey) {
      res.status(400).json({ error: "notionApiKey is required." });
      return;
    }
    res.json({ pages: await listNotionPages(notionApiKey) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/onboarding/setup — create the tenant, store keys, connect the repo. */
onboardingRouter.post("/onboarding/setup", async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const required = ["tenantName", "notionApiKey", "anthropicApiKey", "repoFullName"];
    const missing = required.filter((k) => !b[k]);
    if (missing.length) {
      res.status(400).json({ error: `Missing: ${missing.join(", ")}.` });
      return;
    }
    res.json(await setupTenant(b));
  } catch (err) {
    // A repo already connected to a tenant hits the unique constraint.
    if (/Unique constraint|repoFullName/i.test((err as Error).message)) {
      res.status(409).json({ error: "That repo is already connected to a tenant." });
      return;
    }
    next(err);
  }
});

/** POST /api/onboarding/index — index the chosen pages under the tenant. */
onboardingRouter.post("/onboarding/index", async (req, res, next) => {
  try {
    const { tenantId, pages } = req.body ?? {};
    if (!tenantId || !Array.isArray(pages) || pages.length === 0) {
      res.status(400).json({ error: "tenantId and a non-empty pages[] are required." });
      return;
    }
    res.json({ indexed: await indexTenantPages(tenantId, pages) });
  } catch (err) {
    next(err);
  }
});
