/** Index the Engineering Docs database into pgvector — `pnpm notion:index`. */
import { indexAllEngineeringDocs } from "../services/notion/indexer.js";
import { prisma } from "../db/prisma.js";

async function main(): Promise<void> {
  console.log("Indexing Engineering Docs into pgvector…");
  const results = await indexAllEngineeringDocs();
  const total = results.reduce((n, r) => n + r.chunks, 0);
  console.log(`\n✅ Indexed ${results.length} page(s), ${total} chunk(s).`);
}

main()
  .catch((err) => {
    console.error(`\nIndex failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
