-- AlterEnum: healthy terminal state when the planner concludes no doc changes
-- are needed, distinct from `failed` (an error). (v2 PR-D)
ALTER TYPE "AgentRunStatus" ADD VALUE 'no_changes' BEFORE 'failed';
