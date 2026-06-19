# Sayha AI — RAG Pipeline Task

## STATUS: ✅ COMPLETE

## What Was Built

### RAG Pipeline — Full Stack

1. **PDF Extraction** — `pdfminer.six` via Python subprocess (execFileSync)
   - All 8 PDFs extracted successfully
   - Kasaba file had apostrophe in filename — renamed to `kasaba_uyushmalari.pdf`

2. **Chunking**
   - `chunkByModda()` — for kodeks/qonun docs (splits on `N-modda` / `Modda N` patterns)
   - `chunkByParagraph()` — for Plenum court decisions (splits on `1.`, `2.` numbered paras)

3. **Embeddings** — `@xenova/transformers` with `Xenova/multilingual-e5-small` (384 dims)
   - Local, no API needed
   - Uses `passage: ` prefix for chunks, `query: ` prefix for queries (E5 requirement)
   - Stored as JSON float arrays in `knowledge_chunks.embedding` TEXT column

4. **Database** — `knowledge_chunks` table in Turso via Drizzle
   - 1762 total chunks:
     - Mehnat kodeksi (2022): 581
     - Fuqarolik protsessual kodeksi (2018): 430
     - Fuqarolik kodeksi I qism (1995): 376
     - Konstitutsiya (2023): 155
     - Plenum 26-son (2023): 74
     - Plenum 60-son: 70
     - Kasaba uyushmalari (2019): 56
     - Plenum 18-son (2003): 20

5. **Retrieval** — `retrieve.ts`
   - Cosine similarity in JS (pure, no sqlite-vec needed)
   - Chunk cache loaded into memory once on first request
   - Filters by min score 0.3
   - Returns top-5 chunks

6. **Integration** — `/api/legal/chat` in `index.ts`
   - RAG retrieval runs first
   - Context injected as system prompt block
   - Lex.uz still runs as secondary web source
   - Graceful fallback if RAG fails

## Files
- `packages/web/src/api/rag/ingest.ts` — run once to re-ingest PDFs
- `packages/web/src/api/rag/retrieve.ts` — used at query time
- `packages/web/src/api/database/schema.ts` — has `knowledgeChunks` table
- `packages/web/src/api/index.ts` — wired at `/api/legal/chat`
- `packages/web/vite.config.ts` — `@xenova/transformers` added as SSR external

## Re-ingestion
```
cd packages/web && bun --env-file=../../.env src/api/rag/ingest.ts
```
(~15-20 min for all 1762 chunks)

## Known Limitations
- E5 small model (384 dims) — good for Uzbek/Russian but not state-of-the-art
- Fuqarolik kodeksi only has Part 1 — no Part 2/3
- Chunk cache loads ALL embeddings into RAM (~1762 × 384 × 4B ≈ 2.7MB) — fine
