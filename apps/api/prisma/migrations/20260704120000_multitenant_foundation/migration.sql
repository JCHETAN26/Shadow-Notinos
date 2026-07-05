-- Multi-tenant foundation for the BYOK PoC.
CREATE TABLE "tenants" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
CREATE TABLE "tenant_credentials" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "notionApiKeyEnc" TEXT,
  "anthropicApiKeyEnc" TEXT,
  "githubTokenEnc" TEXT,
  "githubWebhookSecret" TEXT,
  "notionParentPageId" TEXT,
  "releaseBranch" TEXT NOT NULL DEFAULT 'main',
  "docTriggerPaths" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_credentials_tenantId_key" ON "tenant_credentials"("tenantId");
CREATE TABLE "repo_connections" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "repoFullName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repo_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "repo_connections_repoFullName_key" ON "repo_connections"("repoFullName");
CREATE INDEX "repo_connections_tenantId_idx" ON "repo_connections"("tenantId");
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_credentials" ADD CONSTRAINT "tenant_credentials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "tenants" ("id","name") VALUES ('00000000-0000-0000-0000-000000000001','default');
