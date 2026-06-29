import { notion, richTextToPlain } from "../../integrations/notion.js";
import { env } from "../../env.js";

export interface EngineeringDocSummary {
  pageId: string;
  title: string;
  docStatus: string | null;
  url: string;
}

/** List entries in the Engineering Docs database, live from Notion. */
export async function listEngineeringDocs(): Promise<EngineeringDocSummary[]> {
  const databaseId = env.notionDbs.engineeringDocs;
  if (!databaseId) {
    throw new Error(
      "NOTION_ENGINEERING_DOCS_DATABASE_ID is not set. Run `pnpm notion:seed` first.",
    );
  }

  const res = await notion().databases.query({ database_id: databaseId, page_size: 50 });

  return res.results.map((page) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (page as any).properties ?? {};
    const titleProp = props.Name?.title as Array<{ plain_text?: string }> | undefined;
    return {
      pageId: page.id,
      title: richTextToPlain(titleProp) || "(untitled)",
      docStatus: props["Doc Status"]?.select?.name ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      url: (page as any).url ?? "",
    };
  });
}
