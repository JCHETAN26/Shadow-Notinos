import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the single root .env so the API, workers, and scripts share credentials.
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, "../../../.env");
config({ path: rootEnv });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),

  // 32-byte hex key for AES-256-GCM encryption of stored per-tenant credentials
  // (BYOK). Generate with `openssl rand -hex 32`. In prod, source from a KMS.
  masterKey: optional("MASTER_KEY"),

  githubWebhookSecret: optional("GITHUB_WEBHOOK_SECRET"),
  githubToken: optional("GITHUB_TOKEN"),
  // The branch whose merges edit the live doc body. Merges into any other branch
  // are staged under a "Pending changes" toggle instead. (v2 branch-awareness)
  releaseBranch: optional("RELEASE_BRANCH", "main"),
  // Comma/newline-separated glob allowlist. A PR whose changed files match none
  // of these is skipped (no plan). Empty = process every PR. (v2 path gating)
  docTriggerPaths: optional("DOC_TRIGGER_PATHS"),

  anthropicApiKey: optional("ANTHROPIC_API_KEY"),

  notionApiKey: optional("NOTION_API_KEY"),
  notionParentPageId: optional("NOTION_PARENT_PAGE_ID"),
  // Proactive throttle for the Notion API (~3 req/s per integration).
  notionMaxRps: Number(optional("NOTION_MAX_RPS", "3")),
  notionDbs: {
    engineeringDocs: optional("NOTION_ENGINEERING_DOCS_DATABASE_ID"),
    services: optional("NOTION_SERVICES_DATABASE_ID"),
    agentRuns: optional("NOTION_AGENT_RUNS_DATABASE_ID"),
    prUpdates: optional("NOTION_PR_UPDATES_DATABASE_ID"),
    reviewTasks: optional("NOTION_REVIEW_TASKS_DATABASE_ID"),
  },

  apiPort: Number(optional("API_PORT", "4000")),
  webUrl: optional("WEB_URL", "http://localhost:3000"),
};

/** Throw early if a feature's required credential is missing, with a clear message. */
export function requireEnv(name: keyof typeof process.env): string {
  return required(name as string);
}
