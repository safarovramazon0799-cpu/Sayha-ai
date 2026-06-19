/**
 * Batch 9 Fix — re-ingest Temir yo'l nizomi with correct file
 * The original ingest matched O'RQ-588 (kasaba) instead of 8-сон (temir yo'l)
 * Bad chunks already deleted from DB
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

let _embedder: any = null;
async function getEmbedder() {
  if (_embedder) return _embedder;
  _embedder = await pipeline("feature-extraction", "Xenova/multilingual-e5-small");
  return _embedder;
}
async function embedText(text: string): Promise<number[]> {
  const e = await getEmbedder();
  const out = await e(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

const EXTRACTOR = "/tmp/pdf_fix_miner.py";
fs.writeFileSync(EXTRACTOR, `
import sys
from pdfminer.high_level import extract_text
text = extract_text(sys.argv[1])
sys.stdout.buffer.write(text.encode("utf-8"))
`);

function extractPdfText(pdfPath: string): string {
  fs.copyFileSync(pdfPath, "/tmp/rag_extract_input.pdf");
  return execFileSync("python3", [EXTRACTOR, "/tmp/rag_extract_input.pdf"], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
  });
}

function chunkByParagraph(rawText: string): { articleRef: string; chapterRef: string; text: string }[] {
  const chunks: { articleRef: string; chapterRef: string; text: string }[] = [];
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

const ATTACHMENTS_DIR = "/home/user/Attachments";
const BATCH_SIZE = 10;

async function main() {
  const docName = "Qaror 8-son: Temir yo'l transporti xodimlarining intizomi nizomi (2014)";
  
  // Use unique suffix to match correct file
  const files = fs.readdirSync(ATTACHMENTS_DIR);
  const pdfFile = files.find(f => f.includes("LYu3zW"));
  if (!pdfFile) { console.error("❌ File not found (LYu3zW marker)"); process.exit(1); }
  const pdfPath = path.join(ATTACHMENTS_DIR, pdfFile);
  console.log(`📄 ${docName}`);
  console.log(`   File: ${pdfFile.slice(0, 80)}`);

  // Verify not already in DB
  const existing = await client.execute({
    sql: "SELECT COUNT(*) as cnt FROM knowledge_chunks WHERE doc_name = ?",
    args: [docName],
  });
  if (Number((existing.rows[0] as any).cnt) > 0) {
    console.log("   ⏭  Already in DB"); process.exit(0);
  }

  const rawText = extractPdfText(pdfPath);
  console.log(`   Extracted ${rawText.length} chars`);

  const chunks = chunkByParagraph(rawText);
  console.log(`   ${chunks.length} chunks`);

  if (chunks.length === 0) { console.error("   ❌ No chunks"); process.exit(1); }

  let inserted = 0;
  console.log("   Loading model...");
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => `passage: ${docName} | ${c.articleRef}\n${c.text}`);
    const embeddings: number[][] = [];
    for (const t of texts) embeddings.push(await embedText(t));

    await db.insert(knowledgeChunks).values(batch.map((chunk, j) => ({
      docName,
      docType: "labor",
      articleRef: chunk.articleRef,
      chapterRef: chunk.chapterRef,
      chunkText: chunk.text,
      embedding: JSON.stringify(embeddings[j]),
    })));
    inserted += batch.length;
    process.stdout.write(`   Progress: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}\r`);
  }

  console.log(`   ✅ Inserted ${inserted} chunks       `);

  const summary = await client.execute(
    "SELECT COUNT(*) as total_chunks, COUNT(DISTINCT doc_name) as total_docs FROM knowledge_chunks"
  );
  const row = summary.rows[0] as any;
  console.log(`📊 DB total: ${row.total_chunks} chunks across ${row.total_docs} documents`);
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
