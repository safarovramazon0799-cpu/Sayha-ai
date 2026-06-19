/**
 * RAG Ingestion — Batch 4 (append only)
 * Run: cd packages/web && bun --env-file=../../.env src/api/rag/ingest_batch4.ts
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
const EXTRACTOR_PY = "/tmp/pdf_extract_b4.py";
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
  const parts = rawText.split(/(?=\n\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b)/gi);
  const chapterPat = /(\d{1,3}[\-–]\s*bob\b|[IVX]{1,6}[\.\s]+bob\b)/gi;
  let currentChapter = "", buffer = "", articleRef = "";
  for (const part of parts) {
    if (!part) continue;
    const cm = part.match(chapterPat);
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

function findFile(dir: string, marker: string): string | null {
  const f = fs.readdirSync(dir).find(x => x.includes(marker));
  return f ? path.join(dir, f) : null;
}

// ─── Docs ─────────────────────────────────────────────────────────────────────
const ATTACHMENTS_DIR = "/home/user/Attachments";

const DOCS = [
  {
    marker: "938-XII",
    docName: "Qonun 938-XII: Fuqarolarning davlat pensiya ta'minoti (1993)",
    docType: "social_security",
    chunkType: "modda" as const,
  },
  {
    marker: "RQ-642",
    docName: "Qonun O'RQ-642: Aholi bandligi to'g'risida (2020)",
    docType: "labor",
    chunkType: "modda" as const,
  },
  {
    marker: "758-сон",
    docName: "Qaror 758-son: Mehnat kodeksini amalga oshirish normativ hujjatlar (2024)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "01.07.1949",
    docName: "Konventsiya: Jamoa muzokaralari va birlashish huquqi (ILO, 1949)",
    docType: "international",
    chunkType: "modda" as const,
  },
  {
    marker: "RQ-374",
    docName: "Qonun O'RQ-374: Tijorat siri to'g'risida (2014)",
    docType: "commercial",
    chunkType: "modda" as const,
  },
  {
    marker: "RQ-1016",
    docName: "Qonun O'RQ-1016: Davlat sirlari to'g'risida (2024)",
    docType: "administrative",
    chunkType: "modda" as const,
  },
  {
    marker: "RQ-474",
    docName: "Qonun O'RQ-474: Jamoatchilik nazorati to'g'risida (2018)",
    docType: "administrative",
    chunkType: "modda" as const,
  },
  {
    marker: "971-сон",
    docName: "Qaror 971-son: Yagona milliy mehnat tizimi (2019)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;

async function main() {
  console.log("🚀 Batch 4: Appending 8 new documents...\n");
  let totalNew = 0;

  for (const doc of DOCS) {
    console.log(`\n📄 ${doc.docName}`);

    const pdfPath = findFile(ATTACHMENTS_DIR, doc.marker);
    if (!pdfPath) { console.error(`   ❌ Not found (marker: ${doc.marker})`); continue; }
    console.log(`   File: ${path.basename(pdfPath)}`);

    const existing = await client.execute({ sql: "SELECT COUNT(*) as cnt FROM knowledge_chunks WHERE doc_name = ?", args: [doc.docName] });
    if (Number((existing.rows[0] as any).cnt) > 0) {
      console.log(`   ⏭  Already in DB — skipping`); continue;
    }

    let rawText: string;
    try {
      rawText = extractPdfText(pdfPath);
      console.log(`   Extracted ${rawText.length} chars`);
    } catch (err: any) { console.error(`   ❌ Extraction failed: ${err.message}`); continue; }

    let chunks = doc.chunkType === "modda" ? chunkByModda(rawText) : chunkByParagraph(rawText);
    console.log(`   ${chunks.length} chunks (${doc.chunkType} mode)`);

    if (chunks.length === 0 && doc.chunkType === "modda") {
      console.warn("   ⚠️  No modda chunks — fallback to paragraph");
      chunks = chunkByParagraph(rawText);
      console.log(`   Fallback: ${chunks.length} chunks`);
    }
    if (chunks.length === 0) { console.warn("   ⚠️  No chunks — skipping"); continue; }

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

  console.log(`\n✅ Batch 4 complete — ${totalNew} new chunks added`);
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
