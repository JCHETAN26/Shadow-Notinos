import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { healthRouter } from "./routes/health.js";
import { runsRouter } from "./routes/runs.js";
import { notionRouter } from "./routes/notion.js";
import { createAgentWorker } from "./workers/agent.worker.js";

const app = express();

app.use(cors({ origin: env.webUrl, credentials: true }));

// NOTE: the GitHub webhook (Phase 3) needs the *raw* body for signature
// verification, so it must mount its own raw body parser before this. JSON
// parsing here applies to every other route.
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "shadow-notino-api",
    docs: "See docs/SYSTEM_PROMPT.md and docs/BUILD_PLAN.md",
    endpoints: ["/health", "/api/runs", "/api/runs/:id", "/api/notion/docs"],
  });
});

app.use("/", healthRouter);
app.use("/api", runsRouter);
app.use("/api", notionRouter);

// Central error handler — always return a useful message (SYSTEM_PROMPT error rules).
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[api] unhandled error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  },
);

const server = app.listen(env.apiPort, () => {
  console.log(`🛰  shadow-notino API listening on http://localhost:${env.apiPort}`);
});

// For local dev convenience, run the queue worker in-process unless disabled.
// In production, run it separately via `pnpm --filter @shadow/api worker`.
const worker =
  process.env.RUN_WORKER === "false" ? null : createAgentWorker();

function shutdown() {
  server.close(() => {
    (worker ? worker.close() : Promise.resolve()).then(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
