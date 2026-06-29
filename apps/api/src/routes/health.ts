import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { connection } from "../queue.js";

export const healthRouter: Router = Router();

healthRouter.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = "ok";
  } catch {
    checks.postgres = "error";
  }

  try {
    const pong = await connection.ping();
    checks.redis = pong === "PONG" ? "ok" : "error";
  } catch {
    checks.redis = "error";
  }

  const healthy = Object.values(checks).every((c) => c === "ok");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "shadow-notino-api",
    checks,
    time: new Date().toISOString(),
  });
});
