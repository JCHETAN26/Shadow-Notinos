-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "relatedDocs" JSONB;

-- Resize the pgvector embedding column to 384 dims (Transformers.js all-MiniLM-L6-v2).
-- Prisma can't diff Unsupported("vector(...)") types, so this is written by hand.
-- The table holds no embeddings yet, so dropping/re-adding the column is safe.
ALTER TABLE "notion_blocks" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "notion_blocks" ADD COLUMN "embedding" vector(384);
