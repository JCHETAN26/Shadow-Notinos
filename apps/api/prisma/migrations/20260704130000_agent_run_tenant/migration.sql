-- Tenant ownership on runs (BYOK PoC P2). Existing rows default to the default tenant.
ALTER TABLE "agent_runs" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX "agent_runs_tenantId_idx" ON "agent_runs"("tenantId");
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
