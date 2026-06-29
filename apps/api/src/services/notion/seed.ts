import type { Client } from "@notionhq/client";
import { notion } from "../../integrations/notion.js";
import { env } from "../../env.js";
import { prisma } from "../../db/prisma.js";
import {
  BASE_PROPS,
  DB_ENV_VARS,
  DB_ORDER,
  DB_TITLES,
  relationProps,
  type DbKey,
} from "./schema.js";
import { SAMPLE_DOCS, SAMPLE_SERVICES } from "./sample-docs.js";

type Ids = Record<DbKey, string>;

const title = (text: string) => [{ type: "text" as const, text: { content: text } }];

/** Create the five databases under the parent page, then wire up relations. */
async function createDatabases(client: Client, parentPageId: string): Promise<Ids> {
  const ids = {} as Ids;

  // Pass 1 — create each database with its base (non-relation) properties.
  for (const key of DB_ORDER) {
    const db = await client.databases.create({
      parent: { type: "page_id", page_id: parentPageId },
      title: title(DB_TITLES[key]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: BASE_PROPS[key] as any,
    });
    ids[key] = db.id;
    console.log(`  created ${DB_TITLES[key]} → ${db.id}`);
  }

  // Pass 2 — add relation properties now that every id is known.
  const relations = relationProps(ids);
  for (const key of DB_ORDER) {
    const props = relations[key];
    if (Object.keys(props).length === 0) continue;
    await client.databases.update({
      database_id: ids[key],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: props as any,
    });
    console.log(`  linked relations on ${DB_TITLES[key]}`);
  }

  return ids;
}

/** Seed sample services + engineering docs into the freshly created databases. */
async function seedContent(client: Client, ids: Ids): Promise<void> {
  // Services first so docs can relate to them.
  const servicePageByName = new Map<string, string>();
  for (const svc of SAMPLE_SERVICES) {
    const page = await client.pages.create({
      parent: { database_id: ids.services },
      properties: {
        Name: { title: title(svc.name) },
        Repo: { url: svc.repo },
        Criticality: { select: { name: svc.criticality } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
    servicePageByName.set(svc.name, page.id);
    console.log(`  seeded service: ${svc.name}`);
  }

  for (const doc of SAMPLE_DOCS) {
    const servicePageId = servicePageByName.get(doc.serviceName);
    const page = await client.pages.create({
      parent: { database_id: ids.engineeringDocs },
      properties: {
        Name: { title: title(doc.title) },
        "Doc Status": { select: { name: doc.docStatus } },
        "Source Repo": { url: doc.sourceRepo },
        ...(servicePageId ? { Service: { relation: [{ id: servicePageId }] } } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: doc.blocks as any,
    });
    console.log(`  seeded doc: ${doc.title} → ${page.id}`);

    // Mirror into Postgres so the app has a local handle before indexing (Phase 5).
    await prisma.notionDoc.upsert({
      where: { notionPageId: page.id },
      create: {
        notionPageId: page.id,
        title: doc.title,
        serviceName: doc.serviceName,
        docStatus: doc.docStatus,
      },
      update: { title: doc.title, serviceName: doc.serviceName, docStatus: doc.docStatus },
    });
  }
}

export interface SeedResult {
  ids: Ids;
}

/** Full seed: create databases + content. Requires NOTION_PARENT_PAGE_ID. */
export async function seedWorkspace(): Promise<SeedResult> {
  const client = notion();
  if (!env.notionParentPageId) {
    throw new Error(
      "NOTION_PARENT_PAGE_ID is not set. Create a Notion page, share it with your integration, and put its id in .env.",
    );
  }

  console.log("Creating databases…");
  const ids = await createDatabases(client, env.notionParentPageId);
  console.log("Seeding sample content…");
  await seedContent(client, ids);

  return { ids };
}

export interface VerifyIssue {
  db: DbKey;
  problem: string;
}

/** Verify configured database IDs exist and have the required properties. */
export async function verifyWorkspace(): Promise<VerifyIssue[]> {
  const client = notion();
  const issues: VerifyIssue[] = [];

  for (const key of DB_ORDER) {
    const id = env.notionDbs[key as keyof typeof env.notionDbs];
    if (!id) {
      issues.push({ db: key, problem: `${DB_ENV_VARS[key]} is not set in .env` });
      continue;
    }
    try {
      const db = await client.databases.retrieve({ database_id: id });
      const present = new Set(Object.keys((db as { properties: object }).properties));
      const required = Object.keys(BASE_PROPS[key]);
      const missing = required.filter((p) => !present.has(p));
      if (missing.length > 0) {
        issues.push({ db: key, problem: `missing properties: ${missing.join(", ")}` });
      }
    } catch (err) {
      issues.push({
        db: key,
        problem: `cannot retrieve database ${id}: ${(err as Error).message}`,
      });
    }
  }

  return issues;
}
