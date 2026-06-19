/**
 * Google Drive helper
 * - Authenticates via Service Account JSON (GOOGLE_SERVICE_ACCOUNT_JSON env var)
 * - Lists all text/pdf/docx files in the configured folder
 * - Downloads & extracts plain text, caches in-memory, auto-refreshes every CACHE_TTL_MS
 * - Exposes searchDriveChunks() which returns relevant text snippets via keyword match
 */

import { google, drive_v3 } from "googleapis";
import { JWT } from "google-auth-library";

const FOLDER_ID  = "1l3bRlL-NoV-Kw9YA2v_M-Drle7Y7E2st";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuth(): JWT | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn("[GDrive] GOOGLE_SERVICE_ACCOUNT_JSON not set — Drive integration disabled");
    return null;
  }
  try {
    const creds = JSON.parse(raw);
    return new JWT({
      email: creds.client_email,
      key:   creds.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
  } catch (e: any) {
    console.error("[GDrive] Failed to parse service account JSON:", e.message);
    return null;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DriveChunk {
  fileId:   string;
  fileName: string;
  mimeType: string;
  text:     string;   // full extracted text of the file
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

let _cache: DriveChunk[] | null = null;
let _cacheTime = 0;
let _loading: Promise<DriveChunk[]> | null = null;

// ─── Text extraction helpers ─────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{3,}/g, "\n")
    .trim();
}

async function extractText(
  drive: drive_v3.Drive,
  file: drive_v3.Schema$File,
): Promise<string> {
  const id       = file.id!;
  const mime     = file.mimeType ?? "";

  try {
    // Google Docs → export as plain text
    if (mime === "application/vnd.google-apps.document") {
      const res = await drive.files.export(
        { fileId: id, mimeType: "text/plain" },
        { responseType: "text" },
      );
      return String(res.data ?? "").slice(0, 80_000);
    }

    // Google Sheets → export as CSV
    if (mime === "application/vnd.google-apps.spreadsheet") {
      const res = await drive.files.export(
        { fileId: id, mimeType: "text/csv" },
        { responseType: "text" },
      );
      return String(res.data ?? "").slice(0, 20_000);
    }

    // Plain text files
    if (mime.startsWith("text/")) {
      const res = await drive.files.get(
        { fileId: id, alt: "media" },
        { responseType: "text" },
      );
      return String(res.data ?? "").slice(0, 80_000);
    }

    // PDF — download binary, strip to readable text via basic extraction
    if (mime === "application/pdf") {
      const res = await drive.files.get(
        { fileId: id, alt: "media" },
        { responseType: "arraybuffer" },
      );
      // Basic PDF text extraction: pull out readable ASCII runs
      const buf    = Buffer.from(res.data as ArrayBuffer);
      const raw    = buf.toString("latin1");
      const chunks: string[] = [];
      const re     = /[\x20-\x7E\n\r]{6,}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) chunks.push(m[0]);
      return chunks.join(" ").replace(/\s{3,}/g, "\n").slice(0, 80_000);
    }

    // DOCX / other Office formats — skip (too complex without extra deps)
    return `[${file.name} — binary format, skipped]`;
  } catch (e: any) {
    console.warn(`[GDrive] extract failed for "${file.name}":`, e.message);
    return "";
  }
}

// ─── Core loader ─────────────────────────────────────────────────────────────

async function loadDriveFiles(): Promise<DriveChunk[]> {
  const auth = getAuth();
  if (!auth) return [];

  const drive = google.drive({ version: "v3", auth });

  // List all files in the folder (recursive not needed — flat folder expected)
  let allFiles: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 100,
      pageToken,
    });
    allFiles = allFiles.concat(res.data.files ?? []);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  console.log(`[GDrive] Found ${allFiles.length} files in folder`);

  // Download all concurrently (cap at 5 parallel)
  const results: DriveChunk[] = [];
  const BATCH = 5;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const texts = await Promise.all(
      batch.map(async (f) => {
        const text = await extractText(drive, f);
        if (!text || text.length < 10) return null;
        return {
          fileId:   f.id!,
          fileName: f.name ?? "unknown",
          mimeType: f.mimeType ?? "",
          text,
        } satisfies DriveChunk;
      }),
    );
    for (const r of texts) if (r) results.push(r);
  }

  console.log(`[GDrive] Loaded text from ${results.length} files`);
  return results;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns cached chunks, refreshing if stale. Thread-safe via promise guard. */
export async function getDriveChunks(): Promise<DriveChunk[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;

  if (!_loading) {
    _loading = loadDriveFiles().then((chunks) => {
      _cache     = chunks;
      _cacheTime = Date.now();
      _loading   = null;
      return chunks;
    }).catch((e) => {
      console.error("[GDrive] load error:", e.message);
      _loading = null;
      return _cache ?? [];
    });
  }

  return _loading;
}

/** Force-invalidate cache (e.g. after uploading new files) */
export function invalidateDriveCache(): void {
  _cache     = null;
  _cacheTime = 0;
}

/**
 * Search Drive chunks by keywords and return top matches as context blocks.
 * Simple TF-like scoring: count keyword hits per file.
 */
export async function searchDriveChunks(
  query: string,
  topK = 3,
  maxCharsPerFile = 3000,
): Promise<string> {
  const chunks = await getDriveChunks();
  if (chunks.length === 0) return "";

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (keywords.length === 0) return "";

  const scored = chunks.map((c) => {
    const lower = c.text.toLowerCase();
    const score = keywords.reduce((acc, kw) => {
      const re = new RegExp(kw, "gi");
      return acc + (lower.match(re)?.length ?? 0);
    }, 0);
    return { ...c, score };
  }).filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) return "";

  return scored.map((c) => {
    // Extract most relevant window around first keyword hit
    const lower    = c.text.toLowerCase();
    const firstKw  = keywords[0];
    const hitIdx   = lower.indexOf(firstKw);
    const start    = Math.max(0, hitIdx - 200);
    const snippet  = c.text.slice(start, start + maxCharsPerFile);
    return `### Google Drive: ${c.fileName}\n${snippet.trim()}`;
  }).join("\n\n");
}
