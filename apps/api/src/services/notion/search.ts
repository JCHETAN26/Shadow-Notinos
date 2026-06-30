import type { SearchResult } from "@shadow/shared";
import { prisma } from "../../db/prisma.js";
import { embed, toVectorLiteral } from "../embeddings.js";

interface MatchRow {
  notionPageId: string;
  notionBlockId: string;
  headingPath: string | null;
  plainText: string;
  score: number;
}

/**
 * Semantic search over indexed Notion content. Embeds the query, ranks chunks by
 * cosine similarity in pgvector, and groups the best matches by page.
 */
export async function searchDocs(query: string, topK = 5): Promise<SearchResult[]> {
  const vec = toVectorLiteral(await embed(query));

  // Pull more chunk-level matches than pages so each page can show top sections.
  const rows = await prisma.$queryRaw<MatchRow[]>`
    SELECT "notionPageId", "notionBlockId", "headingPath", "plainText",
           1 - (embedding <=> ${vec}::vector) AS score
    FROM "notion_blocks"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${topK * 4}
  `;

  if (rows.length === 0) return [];

  // Title lookup for the matched pages.
  const pageIds = [...new Set(rows.map((r) => r.notionPageId))];
  const docs = await prisma.notionDoc.findMany({
    where: { notionPageId: { in: pageIds } },
    select: { notionPageId: true, title: true },
  });
  const titleByPage = new Map(docs.map((d) => [d.notionPageId, d.title]));

  // Group by page, keeping the best score and the top matching sections.
  const byPage = new Map<string, SearchResult>();
  for (const row of rows) {
    const existing = byPage.get(row.notionPageId);
    const section = {
      blockId: row.notionBlockId,
      headingPath: row.headingPath ?? "",
      plainText: row.plainText,
      score: row.score,
    };
    if (existing) {
      existing.score = Math.max(existing.score, row.score);
      if (existing.matchingSections.length < 3) existing.matchingSections.push(section);
    } else {
      byPage.set(row.notionPageId, {
        pageId: row.notionPageId,
        title: titleByPage.get(row.notionPageId) ?? "(unknown page)",
        score: row.score,
        matchingSections: [section],
      });
    }
  }

  return [...byPage.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Distinct heading paths indexed for a page — the target set for patch actions. */
export async function getPageHeadings(pageId: string): Promise<string[]> {
  const rows = await prisma.notionBlock.findMany({
    where: { notionPageId: pageId, NOT: { headingPath: null } },
    select: { headingPath: true },
    distinct: ["headingPath"],
  });
  return rows
    .map((r) => r.headingPath ?? "")
    .filter((h) => h.length > 0)
    .sort();
}
