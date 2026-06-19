/**
 * RAG Ingestion Script
 * Run once: cd packages/web && bun --env-file=../../.env src/api/rag/ingest.ts
 *
 * Steps:
 *  1. Extract text from PDFs via Python subprocess (pdfminer.six)
 *  2. Chunk by Modda/Article boundaries
 *  3. Generate embeddings via local multilingual-e5-small (Xenova/Transformers)
 *  4. Store in knowledge_chunks table (Turso)
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

// Sequential batching — e5-small is fast enough locally
async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}

// ─── PDF → text via pdfminer ──────────────────────────────────────────────────
const EXTRACTOR_PY = "/tmp/pdf_extract.py";
fs.writeFileSync(EXTRACTOR_PY, `
import sys
from pdfminer.high_level import extract_text
text = extract_text(sys.argv[1])
sys.stdout.buffer.write(text.encode("utf-8"))
`);

// Helper: copy file to a safe temp path to avoid apostrophe/Unicode shell issues
function safeExtractPdfText(pdfPath: string): string {
  const safeTmp = "/tmp/rag_extract_input.pdf";
  fs.copyFileSync(pdfPath, safeTmp);
  const result = execFileSync("python3", [EXTRACTOR_PY, safeTmp], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
  });
  return result;
}

function extractPdfText(pdfPath: string): string {
  return safeExtractPdfText(pdfPath);
}

// ─── Chunking by Modda ────────────────────────────────────────────────────────
interface Chunk {
  articleRef: string;
  chapterRef: string;
  text: string;
}

function chunkByModda(rawText: string): Chunk[] {
  const chunks: Chunk[] = [];

  // Split on article boundaries (Uzbek: "N-modda" or "Modda N")
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
    if (chapterMatch) {
      currentChapter = chapterMatch[chapterMatch.length - 1].trim();
    }

    const artMatch = part.match(/^\s*(\d{1,4}[\-–]\s*modda|\bModda\s+\d{1,4})\b/i);
    if (artMatch) {
      if (articleRef && buffer.trim().length > 30) {
        chunks.push({
          articleRef,
          chapterRef: currentChapter,
          text: buffer.trim().slice(0, 2500),
        });
      }
      articleRef = artMatch[1].trim().replace(/\s+/g, " ");
      buffer = part;
    } else {
      buffer += part;
    }
  }

  // Last chunk
  if (articleRef && buffer.trim().length > 30) {
    chunks.push({
      articleRef,
      chapterRef: currentChapter,
      text: buffer.trim().slice(0, 2500),
    });
  }

  return chunks;
}

// ─── Chunking by paragraph (for Plenum/court decisions) ──────────────────────
function chunkByParagraph(rawText: string, docName: string): Chunk[] {
  const chunks: Chunk[] = [];

  // Numbered paragraphs: "1.", "2.", "10." at start of line
  const paraPattern = /(?=\n\s*(\d{1,3})\.\s+[A-ZОЪQW\u0400-\u04FF])/g;
  const parts = rawText.split(paraPattern);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part.trim().length < 50) continue;

    const numMatch = part.match(/^\s*(\d{1,3})\.\s+/);
    if (numMatch) {
      chunks.push({
        articleRef: `${numMatch[1]}-band`,
        chapterRef: "",
        text: part.trim().slice(0, 2500),
      });
    }
  }

  // If no numbered paragraphs found, chunk by large paragraphs
  if (chunks.length === 0) {
    const paragraphs = rawText.split(/\n{2,}/).filter((p) => p.trim().length > 100);
    for (let i = 0; i < paragraphs.length; i++) {
      chunks.push({
        articleRef: `${i + 1}-qism`,
        chapterRef: "",
        text: paragraphs[i].trim().slice(0, 2500),
      });
    }
  }

  return chunks;
}

// ─── Documents config ─────────────────────────────────────────────────────────
const ATTACHMENTS_DIR = "/home/user/Attachments";

const DOCS: Array<{ file: string; docName: string; docType: string; chunkType?: "modda" | "paragraph" }> = [
  {
    file: "28.10.2022._Oʻzbekiston_Respublikasining_Mehnat_kodeksi_BGsnmw.pdf",
    docName: "Mehnat kodeksi (2022)",
    docType: "labor",
    chunkType: "modda",
  },
  {
    file: "21.12.1995._Oʻzbekiston_Respublikasining_Fuqarolik_kodeksi_(birinchi_qism)_b2xBbW.pdf",
    docName: "Fuqarolik kodeksi (birinchi qism, 1995)",
    docType: "civil",
    chunkType: "modda",
  },
  {
    file: "22.01.2018._Oʻzbekiston_Respublikasining_Fuqarolik_protsessual_kodeksi_AW7_LA.pdf",
    docName: "Fuqarolik protsessual kodeksi (2018)",
    docType: "civil_procedure",
    chunkType: "modda",
  },
  {
    file: "30.04.2023._Oʻzbekiston_Respublikasi_Konstitutsiyasi_BRdh5V.pdf",
    docName: "O'zbekiston Konstitutsiyasi (2023)",
    docType: "constitution",
    chunkType: "modda",
  },
  {
    file: "kasaba_uyushmalari.pdf",
    docName: "Kasaba uyushmalari to'g'risida Qonun (2019)",
    docType: "labor",
    chunkType: "modda",
  },
  {
    file: "18-сон_19.12.2003._Mehnat_vazifalarini_bajarishi_munosabati_bilan_xodimning_hayoti_va_sogʻligʻiga_yetkazilgan_zararni_qoplashga_oid_nizolar_boʻyicha_sud_amaliyoti_haqida__4GrMS.pdf",
    docName: "Plenum 18-son: Mehnat zararini qoplash (2003)",
    docType: "court_ruling",
    chunkType: "paragraph",
  },
  {
    file: "26-сон_20.11.2023._Sudlar_tomonidan_mehnat_shartnomasini_bekor_qilishni_tartibga_soluvchi_qonunchilikni_qoʻllash_amaliyoti_toʻgʻrisida_26za-y.pdf",
    docName: "Plenum 26-son: Mehnat shartnomasi (2023)",
    docType: "court_ruling",
    chunkType: "paragraph",
  },
  {
    file: "60-110~1_bmTjys.PDF",
    docName: "Mehnat vazifalarini bajarishda zararni qoplash (Plenum 60-son)",
    docType: "court_ruling",
    chunkType: "paragraph",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10; // smaller batches since embedding is sequential locally

async function main() {
  console.log("🚀 Starting RAG ingestion...\n");

  // Wipe existing chunks
  console.log("Clearing existing knowledge_chunks...");
  await client.execute("DELETE FROM knowledge_chunks");

  let totalChunks = 0;

  for (const doc of DOCS) {
    const pdfPath = path.join(ATTACHMENTS_DIR, doc.file);
    console.log(`\n📄 Processing: ${doc.docName}`);

    let rawText: string;
    try {
      rawText = extractPdfText(pdfPath);
      console.log(`   Extracted ${rawText.length} chars`);
    } catch (err: any) {
      console.error(`   ❌ PDF extraction failed: ${err.message}`);
      continue;
    }

    const useModda = (doc.chunkType ?? "modda") === "modda";
    let chunks = useModda ? chunkByModda(rawText) : chunkByParagraph(rawText, doc.docName);
    console.log(`   Found ${chunks.length} chunks (${useModda ? "modda" : "paragraph"} mode)`);

    // Fallback: if modda chunking found nothing, try paragraph mode
    if (chunks.length === 0 && useModda) {
      console.warn(`   ⚠️  No modda chunks found — falling back to paragraph mode`);
      chunks = chunkByParagraph(rawText, doc.docName);
      console.log(`   Fallback found ${chunks.length} paragraph chunks`);
    }

    if (chunks.length === 0) {
      console.warn(`   ⚠️  No chunks found — skipping`);
      continue;
    }

    let insertedCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      // Prefix with "passage: " as required by e5 model for passage embedding
      const texts = batch.map((c) => `passage: ${doc.docName} | ${c.articleRef}\n${c.text}`);

      let embeddings: number[][];
      try {
        embeddings = await embedBatch(texts);
      } catch (err: any) {
        console.error(`   ❌ Embedding batch ${i}-${i + batch.length} failed: ${err.message}`);
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

  console.log(`\n✅ Ingestion complete! Total chunks: ${totalChunks}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
