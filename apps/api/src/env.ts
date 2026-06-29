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

  githubWebhookSecret: optional("GITHUB_WEBHOOK_SECRET"),
  githubToken: optional("GITHUB_TOKEN"),

  anthropicApiKey: optional("ANTHROPIC_API_KEY"),

  notionApiKey: optional("NOTION_API_KEY"),
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
