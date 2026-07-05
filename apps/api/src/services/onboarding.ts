import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { encryptSecret } from "./crypto.js";
import { notion, richTextToPlain } from "../integrations/notion.js";
import { anthropic, CLAUDE_MODEL } from "../integrations/anthropic.js";
import { indexPage } from "./notion/indexer.js";
import { env } from "../env.js";

/**
 * Backend for the BYOK onboarding wizard: validate a user's own keys, list the
 * Notion pages they've shared, then create a tenant, store the (encrypted) keys,
 * connect a repo, and index the chosen pages under that tenant.
 */

export interface KeyValidation {
  notion: { ok: boolean; error?: string; workspace?: string };
  anthropic: { ok: boolean; error?: string };
}

/** Live-check both keys so the user learns about a bad key during setup, not later. */
export async function validateKeys(notionApiKey: string, anthropicApiKey: string): Promise<KeyValidation> {
  const result: KeyValidation = { notion: { ok: false }, anthropic: { ok: false } };
  try {
    const me = await notion(notionApiKey).users.me({});
    result.notion = { ok: true, workspace: (me as { name?: string }).name ?? undefined };
  } catch (err) {
    result.notion = { ok: false, error: (err as Error).message };
  }
  try {
    // Cheapest possible call that proves the key works.
    await anthropic(anthropicApiKey).messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    result.anthropic = { ok: true };
  } catch (err) {
    result.anthropic = { ok: false, error: (err as Error).message };
  }
  return result;
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
}

/** Extract a Notion object's display title from whichever property holds it. */
function titleOf(obj: Record<string, unknown>): string {
  const props = (obj.properties ?? {}) as Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>;
  for (const p of Object.values(props)) {
    if (p?.type === "title") return richTextToPlain(p.title) || "(untitled)";
  }
  // Databases carry their title at the top level.
  const dbTitle = obj.title as Array<{ plain_text?: string }> | undefined;
  return richTextToPlain(dbTitle) || "(untitled)";
}

/** List the pages the user's integration can see (i.e. pages they've shared). */
export async function listNotionPages(notionApiKey: string): Promise<NotionPageSummary[]> {
  const res = await notion(notionApiKey).search({
    filter: { property: "object", value: "page" },
    page_size: 50,
  });
  return res.results.map((r) => {
    const o = r as Record<string, unknown>;
    return { id: o.id as string, title: titleOf(o), url: (o.url as string) ?? "" };
  });
}

export interface SetupInput {
  tenantName: string;
  notionApiKey: string;
  anthropicApiKey: string;
  githubToken?: string;
  releaseBranch?: string;
  docTriggerPaths?: string;
  repoFullName: string;
}

export interface SetupResult {
  tenantId: string;
  webhookUrl: string;
  webhookSecret: string;
}

/** Create the tenant, store encrypted credentials, connect the repo, and mint a
 *  webhook secret. Returns the webhook URL + secret to add in the repo settings. */
export async function setupTenant(input: SetupInput): Promise<SetupResult> {
  const webhookSecret = crypto.randomBytes(24).toString("hex");
  const tenant = await prisma.tenant.create({
    data: {
      name: input.tenantName,
      credential: {
        create: {
          notionApiKeyEnc: encryptSecret(input.notionApiKey),
          anthropicApiKeyEnc: encryptSecret(input.anthropicApiKey),
          githubTokenEnc: input.githubToken ? encryptSecret(input.githubToken) : null,
          githubWebhookSecret: webhookSecret,
          releaseBranch: input.releaseBranch || "main",
          docTriggerPaths: input.docTriggerPaths || null,
        },
      },
      repos: { create: { repoFullName: input.repoFullName } },
    },
  });
  return {
    tenantId: tenant.id,
    webhookUrl: `${env.publicApiUrl}/api/webhooks/github`,
    webhookSecret,
  };
}

/** Index the chosen pages under the tenant, using the tenant's own Notion key. */
export async function indexTenantPages(
  tenantId: string,
  pages: Array<{ id: string; title: string }>,
): Promise<Array<{ pageId: string; title: string; chunks: number }>> {
  const cred = await prisma.tenantCredential.findUnique({ where: { tenantId } });
  if (!cred?.notionApiKeyEnc) throw new Error("Tenant has no Notion key configured.");
  const { decryptSecret } = await import("./crypto.js");
  const notionApiKey = decryptSecret(cred.notionApiKeyEnc);

  const out: Array<{ pageId: string; title: string; chunks: number }> = [];
  for (const page of pages) {
    const res = await indexPage(page.id, page.title, tenantId, notionApiKey);
    out.push(res);
  }
  return out;
}
