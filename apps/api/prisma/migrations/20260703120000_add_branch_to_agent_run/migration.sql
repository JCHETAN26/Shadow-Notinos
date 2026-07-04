-- AlterTable: capture the PR's base/head branch on each run (v2 branch-awareness, PR-A).
ALTER TABLE "agent_runs" ADD COLUMN     "baseBranch" TEXT,
ADD COLUMN     "headBranch" TEXT;
