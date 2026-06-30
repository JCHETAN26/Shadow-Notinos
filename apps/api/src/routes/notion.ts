import { Router } from "express";
import { listEngineeringDocs } from "../services/notion/read.js";
import { searchDocs } from "../services/notion/search.js";

export const notionRouter: Router = Router();

// GET /api/notion/docs — list Engineering Docs entries live from Notion.
notionRouter.get("/notion/docs", async (_req, res, next) => {
  try {
    const docs = await listEngineeringDocs();
    res.json({ docs });
  } catch (err) {
    next(err);
  }
});

// GET /api/notion/search?q=...&k=5 — semantic search over indexed Notion content.
notionRouter.get("/notion/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ error: "Provide a query string, e.g. /api/notion/search?q=search fallback" });
      return;
    }
    const k = Math.min(Number(req.query.k) || 5, 20);
    const results = await searchDocs(q, k);
    res.json({ query: q, results });
  } catch (err) {
    next(err);
  }
});
