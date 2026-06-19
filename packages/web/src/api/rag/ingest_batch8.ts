/**
 * RAG Ingestion — Batch 8 (append only)
 * 9 documents: mehnat arbitraji, mehnat normlari, budjet, soliq kodeksi,
 *              ish haqi natura, nikoh/FUQARO holati, rag'batlantirish fondi, tarif setka
 * Run: cd packages/web && bun --env-file=../../.env src/api/rag/ingest_batch8.ts
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { knowledgeChunks } from "../database/schema";
import { pipeline } from "@xenova/transformers";
import { execFileSync, spawnSync } from "child_process";
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

// ─── PDF extraction (dual: pdfminer primary, pypdf fallback) ──────────────────
const EXTRACTOR_PDFMINER = "/tmp/pdf_extract_b8_miner.py";
const EXTRACTOR_PYPDF = "/tmp/pdf_extract_b8_pypdf.py";

fs.writeFileSync(EXTRACTOR_PDFMINER, `
import sys
from pdfminer.high_level import extract_text
text = extract_text(sys.argv[1])
sys.stdout.buffer.write(text.encode("utf-8"))
`);

fs.writeFileSync(EXTRACTOR_PYPDF, `
import sys
import pypdf
r = pypdf.PdfReader(sys.argv[1])
text = "".join(p.extract_text() or "" for p in r.pages)
sys.stdout.buffer.write(text.encode("utf-8"))
`);

function extractPdfText(pdfPath: string): string {
  fs.copyFileSync(pdfPath, "/tmp/rag_extract_input.pdf");
  // Primary: pdfminer
  try {
    return execFileSync("python3", [EXTRACTOR_PDFMINER, "/tmp/rag_extract_input.pdf"], {
      maxBuffer: 50 * 1024 * 1024,
      encoding: "utf8",
    });
  } catch (e: any) {
    // Fallback: pypdf (handles some encoding-broken PDFs)
    console.warn("   ⚠️  pdfminer failed, trying pypdf fallback...");
    return execFileSync("python3", [EXTRACTOR_PYPDF, "/tmp/rag_extract_input.pdf"], {
      maxBuffer: 50 * 1024 * 1024,
      encoding: "utf8",
    });
  }
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
interface Chunk { articleRef: string; chapterRef: string; text: string; }

function chunkByModda(rawText: string): Chunk[] {
  const chunks: Chunk[] = [];
  const parts = rawText.split(/(?=\n\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b)/gi);
  const chapterPat = /(\d{1,3}[\-–]\s*bob\b|[IVX]{1,6}[\.\\s]+bob\b)/gi;
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
    marker: "3449",
    docName: "Qaror 3449-son: Doimiy faoliyat ko'rsatuvchi mehnat arbitraji namunaviy nizomi (2023)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "465-сон",
    docName: "Qaror 465-son: Mehnat normalarini ishlab chiqish va joriy qilish tartibi nizomi (2025)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "PQ-2699",
    docName: "PQ-2699: O'zbekiston 2017-yilgi makroiqtisodiy ko'rsatkichlar prognozi va Davlat budjeti (2016)",
    docType: "administrative",
    chunkType: "paragraph" as const,
  },
  {
    marker: "PF-14-сон",
    docName: "PF-14: Respublika ijro etuvchi hokimiyat organlarini samarali yo'lga qo'yish tadbirlari (2023)",
    docType: "administrative",
    chunkType: "paragraph" as const,
  },
  {
    marker: "Soliq_kodeksi",
    docName: "O'zbekiston Respublikasi Soliq Kodeksi (2020)",
    docType: "tax",
    chunkType: "modda" as const,
  },
  {
    marker: "286-сон",
    docName: "Qaror 286-son: Ish haqini natura shaklida to'lashni tartibga solish (2023)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "550-сон",
    docName: "Qaror 550-son: Nikoh, oila va fuqarolik holati dalolatnomalarini qayd etish normativ hujjatlar (2023)",
    docType: "administrative",
    chunkType: "paragraph" as const,
  },
  {
    marker: "3561",
    docName: "Qaror 3561-son: Budjet tashkilotlari xodimlarini moddiy rag'batlantirish maxsus fondi nizomi (2024)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
  {
    marker: "775-сон",
    docName: "Qaror 775-son: Mehnatga haq to'lash yagona tarif setkasini takomillashtirish (2019)",
    docType: "labor",
    chunkType: "paragraph" as const,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;

async function main() {
  console.log("🚀 Batch 8: Appending 9 new documents...\n");
  let totalNew = 0;

  for (const doc of DOCS) {
    console.log(`\n📄 ${doc.docName}`);

    const pdfPath = findFile(ATTACHMENTS_DIR, doc.marker);
    if (!pdfPath) { console.error(`   ❌ Not found (marker: ${doc.marker})`); continue; }
    console.log(`   File: ${path.basename(pdfPath).slice(0, 80)}`);

    const existing = await client.execute({
      sql: "SELECT COUNT(*) as cnt FROM knowledge_chunks WHERE doc_name = ?",
      args: [doc.docName],
    });
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

  const summary = await client.execute(
    "SELECT COUNT(*) as total_chunks, COUNT(DISTINCT doc_name) as total_docs FROM knowledge_chunks"
  );
  const row = summary.rows[0] as any;
  console.log(`\n✅ Batch 8 complete — ${totalNew} new chunks added`);
  console.log(`📊 DB total: ${row.total_chunks} chunks across ${row.total_docs} documents`);
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
