import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { embed, toVectorLiteral } from "../embeddings.js";
import { crawlPage } from "./crawl.js";
import { chunkBlocks } from "./chunk.js";
import { listEngineeringDocs } from "./read.js";
import { DEFAULT_TENANT_ID } from "../tenants.js";

export interface IndexPageResult {
  pageId: string;
  title: string;
  chunks: number;
}

/** Crawl, chunk, embed, and store one Notion page's content in pgvector, owned
 *  by `tenantId` so retrieval stays scoped to the tenant. */
export async function indexPage(
  pageId: string,
  title: string,
  tenantId: string = DEFAULT_TENANT_ID,
  apiKey?: string,
): Promise<IndexPageResult> {
  const blocks = await crawlPage(pageId, apiKey);
  const chunks = chunkBlocks(blocks);

  // Ensure a notion_docs row exists for this page.
  await prisma.notionDoc.upsert({
    where: { notionPageId: pageId },
    create: { notionPageId: pageId, title, tenantId, lastIndexedAt: new Date() },
    update: { title, tenantId, lastIndexedAt: new Date() },
  });

  // Replace this tenant's previously indexed blocks for this page.
  await prisma.notionBlock.deleteMany({ where: { notionPageId: pageId, tenantId } });

  for (const chunk of chunks) {
    const vec = await embed(chunk.plainText);
    const id = randomUUID();
    // Raw insert so we can write the pgvector column (Prisma can't bind Unsupported types).
    await prisma.$executeRaw`
      INSERT INTO "notion_blocks"
        ("id", "tenantId", "notionPageId", "notionBlockId", "blockType", "headingPath", "plainText", "tokenCount", "embedding", "updatedAt")
      VALUES
        (${id}, ${tenantId}, ${pageId}, ${chunk.blockId}, ${chunk.blockType}, ${chunk.headingPath}, ${chunk.plainText}, ${chunk.tokenCount}, ${toVectorLiteral(vec)}::vector, now())
    `;
  }

  return { pageId, title, chunks: chunks.length };
}

/** Index every page in the Engineering Docs database. */
export async function indexAllEngineeringDocs(): Promise<IndexPageResult[]> {
  const docs = await listEngineeringDocs();
  const results: IndexPageResult[] = [];
  for (const doc of docs) {
    const res = await indexPage(doc.pageId, doc.title);
    console.log(`  indexed "${doc.title}" → ${res.chunks} chunk(s)`);
    results.push(res);
  }
  return results;
}
