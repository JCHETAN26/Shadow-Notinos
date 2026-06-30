import type { CrawledBlock } from "./crawl.js";

export interface DocChunk {
  /** First block id in the chunk — used as a stable handle. */
  blockId: string;
  blockType: string;
  headingPath: string;
  plainText: string;
  tokenCount: number;
}

const MAX_WORDS = 120;

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Group consecutive crawled blocks that share a heading path into chunks of
 * roughly MAX_WORDS. The heading path is prepended to the text so embeddings
 * carry section context.
 */
export function chunkBlocks(blocks: CrawledBlock[]): DocChunk[] {
  const chunks: DocChunk[] = [];
  let current: CrawledBlock[] = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length === 0) return;
    const head = current[0]!;
    const bodyText = current.map((b) => b.plainText).join("\n");
    const text = head.headingPath ? `${head.headingPath}\n${bodyText}` : bodyText;
    chunks.push({
      blockId: head.blockId,
      blockType: head.blockType,
      headingPath: head.headingPath,
      plainText: text,
      tokenCount: wordCount(text),
    });
    current = [];
    currentWords = 0;
  };

  for (const block of blocks) {
    const sameSection = current.length > 0 && current[0]!.headingPath === block.headingPath;
    if (!sameSection) flush();

    current.push(block);
    currentWords += wordCount(block.plainText);
    if (currentWords >= MAX_WORDS) flush();
  }
  flush();

  return chunks;
}
