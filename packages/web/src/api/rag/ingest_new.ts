/**
 * RAG Ingestion — NEW DOCS ONLY (append, no wipe)
 * Run: cd packages/web && bun --env-file=../../.env src/api/rag/ingest_new.ts
 *
 * Adds 8 new legal documents to the existing knowledge base.
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { knowledgeChunks } from "../database/schema";
import { pipeline } from "@xenova/transformers";
import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ─── DB ───────────────────────────────────────────────────────────────────────
const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client);

// ─── Embedder (multilingual-e5-small, 384 dims) ───────────────────────────────
let _embedder: any = null;
let _embedderPromise: Promise<any> | null = null;

async function getEmbedder() {
  if (_embedder) return _embedder;
  if (!_embedderPromise) {
    console.log("   Loading multilingual-e5-small model...");
    _embedderPromise = pipeline("feature-extraction", "Xenova/multilingual-e5-small")
      .then((e) => { _embedder = e; console.log("   Model ready ✓"); return e; });
  }
  return _embedderPromise;
}

async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}

// ─── PDF extraction (copies to /tmp first to avoid Unicode path issues) ───────
const EXTRACTOR_PY = "/tmp/pdf_extract.py";
fs.writeFileSync(EXTRACTOR_PY, `
import sys
from pdfminer.high_level import extract_text
text = extract_text(sys.argv[1])
sys.stdout.buffer.write(text.encode("utf-8"))
`);

function extractPdfText(pdfPath: string): string {
  const safeTmp = "/tmp/rag_extract_input.pdf";
  fs.copyFileSync(pdfPath, safeTmp);
  return execFileSync("python3", [EXTRACTOR_PY, safeTmp], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
  });
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
interface Chunk {
  articleRef: string;
  chapterRef: string;
  text: string;
}

function chunkByModda(rawText: string): Chunk[] {
  const chunks: Chunk[] = [];
  const articlePattern = /(?=\n\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b)/gi;
  const parts = rawText.split(articlePattern);

  let currentChapter = "";
  const chapterPattern = /(\d{1,3}[\-–]\s*bob\b|[IVX]{1,6}[\.\s]+bob\b)/gi;
  let buffer = "";
  let articleRef = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const chapterMatch = part.match(chapterPattern);
    if (chapterMatch) currentChapter = chapterMatch[chapterMatch.length - 1].trim();
    const artMatch = part.match(/^\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b/i);
    if (artMatch) {
      if (articleRef && buffer.trim().length > 30) {
        chunks.push({ articleRef, chapterRef: currentChapter, text: buffer.trim().slice(0, 2500) });
      }
      articleRef = artMatch[1].trim().replace(/\s+/g, " ");
      buffer = part;
    } else {
      buffer += part;
    }
  }
  if (articleRef && buffer.trim().length > 30) {
    chunks.push({ articleRef, chapterRef: currentChapter, text: buffer.trim().slice(0, 2500) });
  }
  return chunks;
}

function chunkByParagraph(rawText: string, docName: string): Chunk[] {
  const chunks: Chunk[] = [];

  // Try numbered paragraphs first
  const paraPattern = /(?=\n\s*(\d{1,3})\.\s+[A-ZОЪQW\u0400-\u04FF])/g;
  const parts = rawText.split(paraPattern);
  for (const part of parts) {
    if (!part || part.trim().length < 50) continue;
    const numMatch = part.match(/^\s*(\d{1,3})\.\s+/);
    if (numMatch) {
      chunks.push({ articleRef: `${numMatch[1]}-band`, chapterRef: "", text: part.trim().slice(0, 2500) });
    }
  }

  // Fallback: large paragraph splits
  if (chunks.length === 0) {
    const paragraphs = rawText.split(/\n{2,}/).filter((p) => p.trim().length > 100);
    for (let i = 0; i < paragraphs.length; i++) {
      chunks.push({ articleRef: `${i + 1}-qism`, chapterRef: "", text: paragraphs[i].trim().slice(0, 2500) });
    }
  }
  return chunks;
}

// ─── Find file by partial name match (handles Unicode/apostrophe filenames) ───
function findFile(dir: string, marker: string): string | null {
  const files = fs.readdirSync(dir);
  const match = files.find((f) => f.includes(marker));
  return match ? path.join(dir, match) : null;
}

// ─── New documents ────────────────────────────────────────────────────────────
const ATTACHMENTS_DIR = "/home/user/Attachments";

interface DocConfig {
  marker: string;       // unique substring in filename to locate it
  docName: string;
  docType: string;
  chunkType: "modda" | "paragraph";
}

const NEW_DOCS: DocConfig[] = [
  {
    marker: "427",
    docName: "Sudyalar oliy kengashi to'g'risida Qonun (2017)",
    docType: "judicial",
    chunkType: "modda",
  },
  {
    marker: "703",
    docName: "Sudlar to'g'risida Qonun (2021)",
    docType: "judicial",
    chunkType: "modda",
  },
  {
    marker: "445",
    docName: "Jismoniy va yuridik shaxslarning murojaatlari to'g'risida Qonun (2017)",
    docType: "administrative",
    chunkType: "modda",
  },
  {
    marker: "Maʼmuriy_javobgarlik",
    docName: "Ma'muriy javobgarlik to'g'risidagi kodeks (1994)",
    docType: "administrative",
    chunkType: "modda",
  },
  {
    marker: "7-сон_28.04.2000",
    docName: "Plenum 7-son: Ma'naviy zararni qoplash (2000)",
    docType: "court_ruling",
    chunkType: "paragraph",
  },
  {
    marker: "62-сон",
    docName: "Plenum 62-son: Tibbiy-ijtimoiy ekspertiza (2022)",
    docType: "health_social",
    chunkType: "paragraph",
  },
  {
    marker: "246-сон",
    docName: "Qaror 246-son: Mehnatni muhofaza qilish xizmatlari bozori (2017)",
    docType: "labor",
    chunkType: "paragraph",
  },
  {
    marker: "410",
    docName: "Qonun O'RQ-410: Mehnatni muhofaza qilish to'g'risida (2016 o'zgartirishlar)",
    docType: "labor",
    chunkType: "modda",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;

async function main() {
  console.log("🚀 Appending 8 new documents to RAG knowledge base...\n");

  let totalChunks = 0;

  for (const doc of NEW_DOCS) {
    console.log(`\n📄 ${doc.docName}`);

    // Find file
    const pdfPath = findFile(ATTACHMENTS_DIR, doc.marker);
    if (!pdfPath) {
      console.error(`   ❌ File not found (marker: ${doc.marker})`);
      continue;
    }
    console.log(`   File: ${path.basename(pdfPath)}`);

    // Check if already ingested
    const existing = await client.execute({
      sql: "SELECT COUNT(*) as cnt FROM knowledge_chunks WHERE doc_name = ?",
      args: [doc.docName],
    });
    const existingCount = Number((existing.rows[0] as any).cnt);
    if (existingCount > 0) {
      console.log(`   ⏭  Already ingested (${existingCount} chunks) — skipping`);
      totalChunks += existingCount;
      continue;
    }

    // Extract text
    let rawText: string;
    try {
      rawText = extractPdfText(pdfPath);
      console.log(`   Extracted ${rawText.length} chars`);
    } catch (err: any) {
      console.error(`   ❌ PDF extraction failed: ${err.message}`);
      continue;
    }

    // Chunk
    let chunks = doc.chunkType === "modda"
      ? chunkByModda(rawText)
      : chunkByParagraph(rawText, doc.docName);

    console.log(`   Found ${chunks.length} chunks (${doc.chunkType} mode)`);

    if (chunks.length === 0 && doc.chunkType === "modda") {
      console.warn(`   ⚠️  No modda chunks — falling back to paragraph`);
      chunks = chunkByParagraph(rawText, doc.docName);
      console.log(`   Fallback: ${chunks.length} paragraph chunks`);
    }

    if (chunks.length === 0) {
      console.warn(`   ⚠️  No chunks found — skipping`);
      continue;
    }

    let insertedCount = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => `passage: ${doc.docName} | ${c.articleRef}\n${c.text}`);

      let embeddings: number[][];
      try {
        embeddings = await embedBatch(texts);
      } catch (err: any) {
        console.error(`   ❌ Embedding batch ${i} failed: ${err.message}`);
        continue;
      }

      const rows = batch.map((chunk, j) => ({
        docName: doc.docName,
        docType: doc.docType,
        articleRef: chunk.articleRef,
        chapterRef: chunk.chapterRef,
        chunkText: chunk.text,
        embedding: JSON.stringify(embeddings[j]),
      }));

      await db.insert(knowledgeChunks).values(rows);
      insertedCount += rows.length;
      process.stdout.write(`   Progress: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}\r`);
    }

    console.log(`   ✅ Inserted ${insertedCount} chunks       `);
    totalChunks += insertedCount;
  }

  console.log(`\n✅ Done! New chunks added. Grand total in DB will include existing + new.`);
  console.log(`   New docs processed: ${totalChunks} chunk slots`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
