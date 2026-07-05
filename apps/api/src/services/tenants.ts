import { prisma } from "../db/prisma.js";
import { decryptSecret } from "./crypto.js";
import { env } from "../env.js";

/** The tenant that owns pre-multi-tenant data and the local `.env` credentials. */
export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export interface TenantCredentials {
  notionApiKey: string;
  anthropicApiKey: string;
  githubToken: string;
  githubWebhookSecret: string;
  notionParentPageId: string;
  releaseBranch: string;
  docTriggerPaths: string;
}

/** The tenant that owns a repo (via RepoConnection), or the default tenant. */
export async function resolveTenantForRepo(repoFullName: string): Promise<string> {
  const conn = await prisma.repoConnection.findUnique({ where: { repoFullName } });
  return conn?.tenantId ?? DEFAULT_TENANT_ID;
}

/**
 * Load + decrypt a tenant's credentials. Any field the tenant hasn't set falls
 * back to `.env` — so the default tenant keeps running from local config during
 * the PoC while real tenants use their own stored (encrypted) keys.
 */
export async function getTenantCredentials(tenantId: string): Promise<TenantCredentials> {
  const c = await prisma.tenantCredential.findUnique({ where: { tenantId } });
  const dec = (v?: string | null) => (v ? decryptSecret(v) : "");
  return {
    notionApiKey: dec(c?.notionApiKeyEnc) || env.notionApiKey,
    anthropicApiKey: dec(c?.anthropicApiKeyEnc) || env.anthropicApiKey,
    githubToken: dec(c?.githubTokenEnc) || env.githubToken,
    githubWebhookSecret: c?.githubWebhookSecret || env.githubWebhookSecret,
    notionParentPageId: c?.notionParentPageId || env.notionParentPageId,
    releaseBranch: c?.releaseBranch || env.releaseBranch,
    docTriggerPaths: c?.docTriggerPaths ?? env.docTriggerPaths,
  };
}
