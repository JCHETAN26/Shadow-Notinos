-- Tenant-scope the doc index so each tenant only retrieves its own docs (BYOK P3/P4).
ALTER TABLE "notion_docs" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "notion_blocks" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX "notion_docs_tenantId_idx" ON "notion_docs"("tenantId");
CREATE INDEX "notion_blocks_tenantId_idx" ON "notion_blocks"("tenantId");
