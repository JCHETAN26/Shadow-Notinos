import { Client } from "@notionhq/client";
import { env } from "../env.js";
import { createRateLimiter } from "./rate-limit.js";

// One client per API key (multi-tenant BYOK: each tenant uses its own Notion token).
const clients = new Map<string, Client>();

/** Process-wide throttle so all Notion calls stay under the API's rate limit. */
export const notionLimiter = createRateLimiter(env.notionMaxRps);

/** Construct/reuse the Notion client for a key (falls back to the env key). */
export function notion(apiKey?: string): Client {
  const key = apiKey || env.notionApiKey;
  if (!key) {
    throw new Error(
      "No Notion API key. Set NOTION_API_KEY in .env, or provide the tenant's key (create an integration at https://www.notion.so/my-integrations).",
    );
  }
  let client = clients.get(key);
  if (!client) {
    client = new Client({ auth: key });
    clients.set(key, client);
  }
  return client;
}

/** A single rich-text run. Notion expects an array of these for text fields. */
export function rt(content: string): Array<{ type: "text"; text: { content: string } }> {
  // Notion caps a single rich-text content string at 2000 chars.
  return [{ type: "text", text: { content: content.slice(0, 2000) } }];
}

/** Build a paragraph block. */
export function paragraph(text: string) {
  return { object: "block" as const, type: "paragraph" as const, paragraph: { rich_text: rt(text) } };
}

/** Build a heading block (level 1–3). */
export function heading(level: 1 | 2 | 3, text: string) {
  const key = `heading_${level}` as const;
  return { object: "block" as const, type: key, [key]: { rich_text: rt(text) } } as Record<string, unknown>;
}

/** Build a bulleted list item. */
export function bullet(text: string) {
  return {
    object: "block" as const,
    type: "bulleted_list_item" as const,
    bulleted_list_item: { rich_text: rt(text) },
  };
}

/** Build a fenced code block. */
export function code(language: string, content: string) {
  return {
    object: "block" as const,
    type: "code" as const,
    code: { rich_text: rt(content), language },
  };
}

/** Build a callout block with an optional emoji icon. */
export function callout(text: string, icon = "💡") {
  return {
    object: "block" as const,
    type: "callout" as const,
    callout: { rich_text: rt(text), icon: { type: "emoji" as const, emoji: icon } },
  };
}

/** Build a to-do block. */
export function todo(text: string, checked = false) {
  return {
    object: "block" as const,
    type: "to_do" as const,
    to_do: { rich_text: rt(text), checked },
  };
}

/** Build a collapsible toggle block with optional nested children. */
export function toggle(title: string, children: Array<Record<string, unknown>> = []) {
  return {
    object: "block" as const,
    type: "toggle" as const,
    toggle: { rich_text: rt(title), children },
  };
}

/** Flatten a Notion rich_text array to plain text. */
export function richTextToPlain(
  richText: Array<{ plain_text?: string }> | undefined,
): string {
  if (!richText) return "";
  return richText.map((r) => r.plain_text ?? "").join("");
}
