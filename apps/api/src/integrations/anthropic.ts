import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";

let client: Anthropic | null = null;

/** Default planner model. Override with CLAUDE_MODEL in .env if needed. */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

/** Lazily construct the Anthropic client so non-LLM commands don't require the key. */
export function anthropic(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env (https://console.anthropic.com/).",
    );
  }
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * Call Claude and return the concatenated text of the response.
 * The planner asks for JSON only; we validate the result with Zod downstream.
 */
export async function callClaude(system: string, user: string): Promise<string> {
  const res = await anthropic().messages.create({
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
