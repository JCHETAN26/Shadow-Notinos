-- A Notion page is unique per tenant, not globally (multi-tenant correctness).
DROP INDEX IF EXISTS "notion_docs_notionPageId_key";
CREATE UNIQUE INDEX "notion_docs_tenantId_notionPageId_key" ON "notion_docs"("tenantId", "notionPageId");
