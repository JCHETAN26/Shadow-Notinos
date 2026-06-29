import { z } from "zod";

/** A chunk of Notion page content, embedded and stored in pgvector. */
export const NotionDocChunkSchema = z.object({
  pageId: z.string(),
  blockId: z.string(),
  blockType: z.string(),
  /** Breadcrumb of headings leading to this block, e.g. "API Reference > Endpoints". */
  headingPath: z.string().default(""),
  plainText: z.string(),
  tokenCount: z.number().int().nonnegative().default(0),
});
export type NotionDocChunk = z.infer<typeof NotionDocChunkSchema>;

/** A retrieval hit returned by the doc search endpoint. */
export const SearchResultSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  score: z.number(),
  matchingSections: z
    .array(
      z.object({
        blockId: z.string(),
        headingPath: z.string(),
        plainText: z.string(),
        score: z.number(),
      }),
    )
    .default([]),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/** Result of applying a single patch action to Notion. */
export const NotionWriteResultSchema = z.object({
  actionType: z.string(),
  ok: z.boolean(),
  /** Notion block/page id created or updated, when applicable. */
  notionId: z.string().optional(),
  error: z.string().optional(),
});
export type NotionWriteResult = z.infer<typeof NotionWriteResultSchema>;
