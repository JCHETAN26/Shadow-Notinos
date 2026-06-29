import { Router } from "express";
import { listEngineeringDocs } from "../services/notion/read.js";

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
