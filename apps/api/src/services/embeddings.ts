import { pipeline, env as xenovaEnv } from "@xenova/transformers";

/**
 * Local, offline text embeddings via Transformers.js (all-MiniLM-L6-v2, 384-dim).
 * No API key required. The ~90MB model downloads once on first use and is cached.
 */
export const EMBED_DIM = 384;
const MODEL = "Xenova/all-MiniLM-L6-v2";

// We always fetch the model from the HF hub on first run, then cache it.
xenovaEnv.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL);
  }
  return extractorPromise;
}

/** Embed a single string into a 384-dim, L2-normalized vector. */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text.slice(0, 4000), { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** Embed many strings sequentially (the model is single-threaded in-process). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}

/** Format a vector as a pgvector literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
