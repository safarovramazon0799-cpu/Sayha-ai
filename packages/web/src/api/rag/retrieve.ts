/**
 * RAG Retrieval
 * Given a user query, returns top-K most relevant law article chunks via cosine similarity.
 * Uses multilingual-e5-small embeddings (384 dims, local, no API required).
 */

import { db } from "../database";
import { knowledgeChunks } from "../database/schema";
import { pipeline } from "@xenova/transformers";

// ─── Embedder (singleton with promise guard) ──────────────────────────────────
let _embedder: any = null;
let _embedderPromise: Promise<any> | null = null;

async function getEmbedder() {
  if (_embedder) return _embedder;
  if (!_embedderPromise) {
    _embedderPromise = pipeline("feature-extraction", "Xenova/multilingual-e5-small")
      .then((e) => { _embedder = e; return e; });
  }
  return _embedderPromise;
}

async function embedQuery(query: string): Promise<number[]> {
  const embedder = await getEmbedder();
  // "query: " prefix is required by the E5 model for query-side embedding
  const output = await embedder(`query: ${query}`, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

// ─── Cosine similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Chunk cache (loaded once into memory) ────────────────────────────────────
interface CachedChunk {
  docName: string;
  docType: string;
  articleRef: string;
  chapterRef: string;
  chunkText: string;
  embedding: number[];
}

let _cachedChunks: CachedChunk[] | null = null;

async function loadChunks(): Promise<CachedChunk[]> {
  if (_cachedChunks !== null) return _cachedChunks;

  const rows = await db
    .select({
      docName: knowledgeChunks.docName,
      docType: knowledgeChunks.docType,
      articleRef: knowledgeChunks.articleRef,
      chapterRef: knowledgeChunks.chapterRef,
      chunkText: knowledgeChunks.chunkText,
      embedding: knowledgeChunks.embedding,
    })
    .from(knowledgeChunks);

  _cachedChunks = rows.map((r) => ({
    ...r,
    embedding: JSON.parse(r.embedding) as number[],
  }));

  console.log(`[RAG] Loaded ${_cachedChunks.length} chunks into memory`);
  return _cachedChunks;
}

export function clearChunkCache(): void {
  _cachedChunks = null;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RetrievedChunk {
  docName: string;
  docType: string;
  articleRef: string;
  chapterRef: string;
  chunkText: string;
  score: number;
}

// ─── Main retrieval function ──────────────────────────────────────────────────
export async function retrieveRelevantChunks(
  query: string,
  topK = 5,
  docTypeFilter?: string,
): Promise<RetrievedChunk[]> {
  const queryVec = await embedQuery(query);
  const chunks = await loadChunks();

  const scored = chunks
    .filter((c) => !docTypeFilter || c.docType === docTypeFilter)
    .map((c) => ({ ...c, score: cosineSimilarity(queryVec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

// ─── Format as context block for system prompt ────────────────────────────────
export function formatRagContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  const MIN_SCORE = 0.3; // ignore low-confidence chunks
  const relevant = chunks.filter((c) => c.score >= MIN_SCORE);
  if (relevant.length === 0) return "";

  const lines = relevant.map(
    (c, i) =>
      `### [${i + 1}] ${c.docName} — ${c.articleRef}${c.chapterRef ? ` (${c.chapterRef})` : ""}\n${c.chunkText.trim()}`
  );

  return (
    `\n\n---\n` +
    `## Rasmiy Hujjatlardan Olingan Manbalar (RAG — Ishonchli Ma'lumot)\n\n` +
    `Quyidagi moddalar O'zbekiston Respublikasining rasmiy qonunchiligi hujjatlaridan olingan.\n` +
    `FAQAT shu manbalar asosida huquqiy tahlil qiling. Har bir bayonotni tegishli modda raqami bilan ko'rsating:\n\n` +
    lines.join("\n\n") +
    `\n\n---\n`
  );
}
