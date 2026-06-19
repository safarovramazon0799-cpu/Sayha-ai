/**
 * RAG Ingestion — Batch 3 (append only, no wipe)
 * Run: cd packages/web && bun --env-file=../../.env src/api/rag/ingest_batch3.ts
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { knowledgeChunks } from "../database/schema";
import { pipeline } from "@xenova/transformers";
import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client);

// ─── Embedder ─────────────────────────────────────────────────────────────────
let _embedder: any = null;
async function getEmbedder() {
  if (_embedder) return _embedder;
  console.log("   Loading multilingual-e5-small model...");
  _embedder = await pipeline("feature-extraction", "Xenova/multilingual-e5-small");
  console.log("   Model ready ✓");
  return _embedder;
}
async function embedText(text: string): Promise<number[]> {
  const e = await getEmbedder();
  const out = await e(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}
async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const t of texts) results.push(await embedText(t));
  return results;
}

// ─── PDF extraction ───────────────────────────────────────────────────────────
const EXTRACTOR_PY = "/tmp/pdf_extract_b3.py";
fs.writeFileSync(EXTRACTOR_PY, `
import sys
from pdfminer.high_level import extract_text
text = extract_text(sys.argv[1])
sys.stdout.buffer.write(text.encode("utf-8"))
`);

function extractPdfText(pdfPath: string): string {
  fs.copyFileSync(pdfPath, "/tmp/rag_extract_input.pdf");
  return execFileSync("python3", [EXTRACTOR_PY, "/tmp/rag_extract_input.pdf"], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
  });
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
interface Chunk { articleRef: string; chapterRef: string; text: string; }

function chunkByModda(rawText: string): Chunk[] {
  const chunks: Chunk[] = [];
  const articlePattern = /(?=\n\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b)/gi;
  const parts = rawText.split(articlePattern);
  const chapterPattern = /(\d{1,3}[\-–]\s*bob\b|[IVX]{1,6}[\.\s]+bob\b)/gi;
  let currentChapter = "", buffer = "", articleRef = "";
  for (const part of parts) {
    if (!part) continue;
    const cm = part.match(chapterPattern);
    if (cm) currentChapter = cm[cm.length - 1].trim();
    const am = part.match(/^\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b/i);
    if (am) {
      if (articleRef && buffer.trim().length > 30)
        chunks.push({ articleRef, chapterRef: currentChapter, text: buffer.trim().slice(0, 2500) });
      articleRef = am[1].trim().replace(/\s+/g, " ");
      buffer = part;
    } else { buffer += part; }
  }
  if (articleRef && buffer.trim().length > 30)
    chunks.push({ articleRef, chapterRef: currentChapter, text: buffer.trim().slice(0, 2500) });
  return chunks;
}

function chunkByParagraph(rawText: string): Chunk[] {
  const chunks: Chunk[] = [];
  const parts = rawText.split(/(?=\n\s*(\d{1,3})\.\s+[A-ZОЪQW\u0400-\u04FF])/g);
  for (const part of parts) {
    if (!part || part.trim().length < 50) continue;
    const m = part.match(/^\s*(\d{1,3})\.\s+/);
    if (m) chunks.push({ articleRef: `${m[1]}-band`, chapterRef: "", text: part.trim().slice(0, 2500) });
  }
  if (chunks.length === 0) {
    rawText.split(/\n{2,}/).filter(p => p.trim().length > 100).forEach((p, i) =>
      chunks.push({ articleRef: `${i + 1}-qism`, chapterRef: "", text: p.trim().slice(0, 2500) }));
  }
  return chunks;
}

// ─── Find file by marker ──────────────────────────────────────────────────────
function findFile(dir: string, marker: string): string | null {
  const f = fs.readdirSync(dir).find(x => x.includes(marker));
  return f ? path.join(dir, f) : null;
}

// ─── Docs ─────────────────────────────────────────────────────────────────────
const ATTACHMENTS_DIR = "/home/user/Attachments";

const DOCS = [
  {
    marker: "542-сон",
    docName: "Qaror 542-son: Tadbirkorlik subyektlari bo'lmagan yuridik shaxslar (2022)",
    docType: "corporate",
    chunkType: "paragraph" as const,
  },
  {
    marker: "66-090",
    docName: "Qaror 66-son: Tadbirkorlarni davlat ro'yxatidan o'tkazish (2017)",
    docType: "corporate",
    chunkType: "paragraph" as const,
  },
  {
    marker: "PQ-4754",
    docName: "PQ-4754: Nizolarni muqobil hal etish mexanizmlari (2020)",
    docType: "dispute_resolution",
    chunkType: "paragraph" as const,
  },
  {
    marker: "RQ-139",
    docName: "Qonun O'RQ-139: Bola huquqlarining kafolatlari (2008)",
    docType: "family",
    chunkType: "modda" as const,
  },
  {
    marker: "PQ-345",
    docName: "PQ-345: Milliy malaka tizimi takomillashtirish (2024)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "369-сон_17.06.2025",
    docName: "Qaror 369-son: Milliy malaka tizimi normativ hujjatlar (2025)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "257-II",
    docName: "Qonun 257-II: Prokuratura to'g'risida o'zgartirishlar (2001)",
    docType: "prosecution",
    chunkType: "modda" as const,
  },
  // O'RQ-427 (3NEzpj) already in DB as "Sudyalar oliy kengashi to'g'risida Qonun (2017)" — skip
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;

async function main() {
  console.log("🚀 Batch 3: Appending 7 new documents...\n");
  let totalNew = 0;

  for (const doc of DOCS) {
    console.log(`\n📄 ${doc.docName}`);

    const pdfPath = findFile(ATTACHMENTS_DIR, doc.marker);
    if (!pdfPath) { console.error(`   ❌ File not found (marker: ${doc.marker})`); continue; }
    console.log(`   File: ${path.basename(pdfPath)}`);

    // Skip if already ingested
    const existing = await client.execute({ sql: "SELECT COUNT(*) as cnt FROM knowledge_chunks WHERE doc_name = ?", args: [doc.docName] });
    const cnt = Number((existing.rows[0] as any).cnt);
    if (cnt > 0) { console.log(`   ⏭  Already in DB (${cnt} chunks)`); continue; }

    // Extract
    let rawText: string;
    try {
      rawText = extractPdfText(pdfPath);
      console.log(`   Extracted ${rawText.length} chars`);
    } catch (err: any) { console.error(`   ❌ Extraction failed: ${err.message}`); continue; }

    // Chunk
    let chunks = doc.chunkType === "modda" ? chunkByModda(rawText) : chunkByParagraph(rawText);
    console.log(`   ${chunks.length} chunks (${doc.chunkType} mode)`);

    if (chunks.length === 0 && doc.chunkType === "modda") {
      console.warn("   ⚠️  No modda chunks — fallback to paragraph");
      chunks = chunkByParagraph(rawText);
      console.log(`   Fallback: ${chunks.length} chunks`);
    }
    if (chunks.length === 0) { console.warn("   ⚠️  No chunks — skipping"); continue; }

    // Embed + insert
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => `passage: ${doc.docName} | ${c.articleRef}\n${c.text}`);
      let embeddings: number[][];
      try { embeddings = await embedBatch(texts); }
      catch (err: any) { console.error(`   ❌ Embed batch ${i} failed: ${err.message}`); continue; }

      await db.insert(knowledgeChunks).values(batch.map((chunk, j) => ({
        docName: doc.docName,
        docType: doc.docType,
        articleRef: chunk.articleRef,
        chapterRef: chunk.chapterRef,
        chunkText: chunk.text,
        embedding: JSON.stringify(embeddings[j]),
      })));
      inserted += batch.length;
      process.stdout.write(`   Progress: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}\r`);
    }
    console.log(`   ✅ Inserted ${inserted} chunks       `);
    totalNew += inserted;
  }

  console.log(`\n✅ Batch 3 complete — ${totalNew} new chunks added`);
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
