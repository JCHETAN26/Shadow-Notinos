/** Search indexed Notion docs — `pnpm notion:search "search fallback ranking"`. */
import { searchDocs } from "../services/notion/search.js";
import { prisma } from "../db/prisma.js";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: pnpm notion:search "your query"');
    process.exitCode = 1;
    return;
  }

  const results = await searchDocs(query, 5);
  if (results.length === 0) {
    console.log("No matches. Have you run `pnpm notion:index`?");
    return;
  }

  console.log(`Top results for: "${query}"\n`);
  for (const r of results) {
    console.log(`• ${r.title}  (score ${r.score.toFixed(3)})`);
    const top = r.matchingSections[0];
    if (top?.headingPath) console.log(`    ↳ ${top.headingPath}`);
  }
}

main()
  .catch((err) => {
    console.error(`\nSearch failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
