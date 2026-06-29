-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'fetching_pr', 'indexing', 'searching', 'planning', 'waiting_approval', 'applying', 'applied', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "PatchPlanStatus" AS ENUM ('proposed', 'approved', 'rejected', 'applied', 'failed');

-- CreateEnum
CREATE TYPE "PatchActionStatus" AS ENUM ('pending', 'applied', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "author" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "diffSummary" TEXT,
    "impactSummary" TEXT,
    "prContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_docs" (
    "id" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "serviceName" TEXT,
    "owner" TEXT,
    "docStatus" TEXT,
    "lastIndexedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notion_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_blocks" (
    "id" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "notionBlockId" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "headingPath" TEXT,
    "plainText" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(1536),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notion_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patch_plans" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "targetPageId" TEXT NOT NULL,
    "status" "PatchPlanStatus" NOT NULL DEFAULT 'proposed',
    "patchJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "patch_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patch_actions" (
    "id" TEXT NOT NULL,
    "patchPlanId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetBlockId" TEXT,
    "headingMatch" TEXT,
    "notionPayload" JSONB NOT NULL,
    "status" "PatchActionStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "notionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "patch_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_repo_prNumber_idx" ON "agent_runs"("repo", "prNumber");

-- CreateIndex
CREATE INDEX "run_events_agentRunId_idx" ON "run_events"("agentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "notion_docs_notionPageId_key" ON "notion_docs"("notionPageId");

-- CreateIndex
CREATE INDEX "notion_blocks_notionPageId_idx" ON "notion_blocks"("notionPageId");

-- CreateIndex
CREATE INDEX "patch_plans_agentRunId_idx" ON "patch_plans"("agentRunId");

-- CreateIndex
CREATE INDEX "patch_actions_patchPlanId_idx" ON "patch_actions"("patchPlanId");

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patch_plans" ADD CONSTRAINT "patch_plans_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patch_actions" ADD CONSTRAINT "patch_actions_patchPlanId_fkey" FOREIGN KEY ("patchPlanId") REFERENCES "patch_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
