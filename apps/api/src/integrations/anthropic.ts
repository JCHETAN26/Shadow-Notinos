import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";

// One client per API key (multi-tenant BYOK: each tenant uses its own key).
const clients = new Map<string, Anthropic>();

/** Default planner model. Override with CLAUDE_MODEL in .env if needed. */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

/** Construct/reuse the Anthropic client for a key (falls back to the env key). */
export function anthropic(apiKey?: string): Anthropic {
  const key = apiKey || env.anthropicApiKey;
  if (!key) {
    throw new Error(
      "No Anthropic API key. Set ANTHROPIC_API_KEY in .env, or provide the tenant's key.",
    );
  }
  let client = clients.get(key);
  if (!client) {
    client = new Anthropic({ apiKey: key });
    clients.set(key, client);
  }
  return client;
}

/**
 * Call Claude and return the concatenated text of the response.
 * The planner asks for JSON only; we validate the result with Zod downstream.
 */
export async function callClaude(system: string, user: string, apiKey?: string): Promise<string> {
  const res = await anthropic(apiKey).messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
