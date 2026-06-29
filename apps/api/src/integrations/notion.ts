import { Client } from "@notionhq/client";
import { env } from "../env.js";

let client: Client | null = null;

/** Lazily construct the Notion client so commands that don't touch Notion don't require the key. */
export function notion(): Client {
  if (!env.notionApiKey) {
    throw new Error(
      "NOTION_API_KEY is not set. Add it to .env (create an integration at https://www.notion.so/my-integrations).",
    );
  }
  if (!client) client = new Client({ auth: env.notionApiKey });
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

/** Flatten a Notion rich_text array to plain text. */
export function richTextToPlain(
  richText: Array<{ plain_text?: string }> | undefined,
): string {
  if (!richText) return "";
  return richText.map((r) => r.plain_text ?? "").join("");
}
