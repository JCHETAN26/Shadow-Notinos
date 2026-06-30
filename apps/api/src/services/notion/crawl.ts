import { notion, richTextToPlain } from "../../integrations/notion.js";

export interface CrawledBlock {
  blockId: string;
  blockType: string;
  /** Breadcrumb of headings above this block, e.g. "Endpoints > Configuration". */
  headingPath: string;
  plainText: string;
}

interface HeadingFrame {
  level: number;
  text: string;
}

/** Pull the plain text out of a block's rich_text payload, by block type. */
function blockText(block: Record<string, unknown>, type: string): string {
  const body = block[type] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  return richTextToPlain(body?.rich_text);
}

function headingLevel(type: string): number | null {
  if (type === "heading_1") return 1;
  if (type === "heading_2") return 2;
  if (type === "heading_3") return 3;
  return null;
}

/**
 * Recursively walk a Notion page's block tree, emitting each text-bearing block
 * with the heading breadcrumb it sits under. Order is preserved.
 */
export async function crawlPage(pageId: string): Promise<CrawledBlock[]> {
  const out: CrawledBlock[] = [];
  const stack: HeadingFrame[] = [];

  async function walk(blockId: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const res = await notion().blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const block of res.results) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = block as any;
        const type: string = b.type;
        const text = blockText(b, type).trim();

        const level = headingLevel(type);
        if (level !== null) {
          // Pop deeper/equal headings, then push this one.
          while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
          stack.push({ level, text });
        }

        const headingPath = stack.map((s) => s.text).join(" > ");
        if (text.length > 0) {
          out.push({ blockId: b.id, blockType: type, headingPath, plainText: text });
        }

        if (b.has_children) await walk(b.id);
      }

      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  await walk(pageId);
  return out;
}
