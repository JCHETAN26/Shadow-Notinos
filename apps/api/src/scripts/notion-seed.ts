/**
 * Notion workspace seeder — `pnpm notion:seed`.
 *
 *   pnpm notion:seed                seed databases + sample docs (or verify if already set up)
 *   pnpm notion:seed --verify       only verify configured database IDs + properties
 *   pnpm notion:seed --force        create fresh databases even if IDs are already set
 *   pnpm notion:seed --write-env    append the created database IDs to .env
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { env } from "../env.js";
import { seedWorkspace, verifyWorkspace } from "../services/notion/seed.js";
import { DB_ENV_VARS, DB_ORDER, type DbKey } from "../services/notion/schema.js";

const args = new Set(process.argv.slice(2));
const ROOT_ENV = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");

function allIdsConfigured(): boolean {
  return DB_ORDER.every((k) => Boolean(env.notionDbs[k as keyof typeof env.notionDbs]));
}

async function runVerify(): Promise<void> {
  console.log("Verifying Notion workspace…");
  const issues = await verifyWorkspace();
  if (issues.length === 0) {
    console.log("✅ All databases present with the required properties.");
    return;
  }
  console.error("❌ Workspace verification found issues:");
  for (const i of issues) console.error(`  • ${i.db}: ${i.problem}`);
  process.exitCode = 1;
}

async function writeEnv(ids: Record<DbKey, string>): Promise<void> {
  let contents = "";
  try {
    contents = await readFile(ROOT_ENV, "utf8");
  } catch {
    /* .env may not exist; we'll create it */
  }
  for (const key of DB_ORDER) {
    const name = DB_ENV_VARS[key];
    const line = `${name}="${ids[key]}"`;
    const re = new RegExp(`^${name}=.*$`, "m");
    contents = re.test(contents)
      ? contents.replace(re, line)
      : `${contents.trimEnd()}\n${line}\n`;
  }
  await writeFile(ROOT_ENV, contents);
  console.log(`✏️  Wrote database IDs to ${ROOT_ENV}`);
}

async function main(): Promise<void> {
  if (args.has("--verify")) {
    await runVerify();
    return;
  }

  if (allIdsConfigured() && !args.has("--force")) {
    console.log(
      "All NOTION_*_DATABASE_ID values are already set — verifying instead of re-creating.",
    );
    console.log("Pass --force to create a fresh set of databases.\n");
    await runVerify();
    return;
  }

  const { ids } = await seedWorkspace();

  console.log("\n✅ Seed complete. Add these to your .env:\n");
  for (const key of DB_ORDER) console.log(`${DB_ENV_VARS[key]}="${ids[key]}"`);

  if (args.has("--write-env")) await writeEnv(ids);
  else console.log("\n(Re-run with --write-env to write these automatically.)");
}

main()
  .catch((err) => {
    console.error(`\nSeed failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void import("../db/prisma.js").then(({ prisma }) => prisma.$disconnect());
  });
