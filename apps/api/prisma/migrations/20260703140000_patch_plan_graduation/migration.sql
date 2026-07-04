-- Manual graduation of pending deltas (v2 PR-F).
-- AlterEnum
ALTER TYPE "PatchPlanStatus" ADD VALUE 'graduated';
ALTER TYPE "PatchPlanStatus" ADD VALUE 'dismissed';

-- AlterTable: Notion block ids staged under the "Pending changes" toggle.
ALTER TABLE "patch_plans" ADD COLUMN "pendingBlockIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
