/**
 * Lex.uz Live Validator
 *
 * Two responsibilities:
 * 1. Pre-fetch: search lex.uz for a query and return raw text context (already in index.ts,
 *    but now centralised here with richer HTML parsing).
 *
 * 2. Post-validate: given an AI response text, extract every law/article reference
 *    (e.g. "Mehnat kodeksi 129-modda", "Fuqarolik kodeksi 350-modda"),
 *    fetch the lex.uz search page for each, check the document status flag,
 *    and return a warning block to append to the final response.
 */

// ─── Pre-fetch (context enrichment) ──────────────────────────────────────────

export async function fetchLexUzSearch(query: string, maxChars = 2500): Promise<string> {
  try {
    const encoded = encodeURIComponent(query.slice(0, 150));
    const res = await fetch(`https://lex.uz/search?q=${encoded}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SayhaAI/1.0; +https://sayha.uz)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "Lex.uz qidiruvda natija topilmadi.";

    const html = await res.text();
    const text = stripHtml(html).slice(0, maxChars);
    return text || "Lex.uz qidiruvda natija topilmadi.";
  } catch (e: any) {
    console.warn("[lex.uz] pre-fetch failed:", e.message);
    return "Lex.uz ga ulanish imkoni bo'lmadi.";
  }
}

// ─── Article reference extractor ─────────────────────────────────────────────

interface ArticleRef {
  raw:        string;   // original matched string
  docKeyword: string;   // e.g. "Mehnat kodeksi"
  articleNum: string;   // e.g. "129"
  searchQuery: string;  // query to send to lex.uz
}

const DOC_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /Mehnat\s+kodeksi\s+(\d+)[\-–]?(?:modda)?/gi,        label: "Mehnat kodeksi" },
  { pattern: /Fuqarolik\s+kodeksi\s+(\d+)[\-–]?(?:modda)?/gi,    label: "Fuqarolik kodeksi" },
  { pattern: /Oila\s+kodeksi\s+(\d+)[\-–]?(?:modda)?/gi,         label: "Oila kodeksi" },
  { pattern: /Soliq\s+kodeksi\s+(\d+)[\-–]?(?:modda)?/gi,        label: "Soliq kodeksi" },
  { pattern: /Jinoyat\s+kodeksi\s+(\d+)[\-–]?(?:modda)?/gi,      label: "Jinoyat kodeksi" },
  { pattern: /Ma['']muriy\s+javobgarlik\s+kodeksi\s+(\d+)/gi,     label: "Ma'muriy javobgarlik kodeksi" },
  { pattern: /Yer\s+kodeksi\s+(\d+)[\-–]?(?:modda)?/gi,          label: "Yer kodeksi" },
  // Generic "X-modda" patterns (catch loose references)
  { pattern: /(\d{2,3})[\-–]modda/gi, label: "" },
];

export function extractArticleRefs(text: string): ArticleRef[] {
  const found: ArticleRef[] = [];
  const seen = new Set<string>();

  for (const { pattern, label } of DOC_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const articleNum = m[1];
      if (!articleNum) continue;
      const key = `${label}:${articleNum}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const docKeyword = label || "modda";
      const searchQuery = label
        ? `${label} ${articleNum}-modda`
        : `${articleNum}-modda`;

      found.push({ raw: m[0], docKeyword, articleNum, searchQuery });
    }
  }

  // Deduplicate and cap at 5 to avoid too many HTTP calls
  return found.slice(0, 5);
}

// ─── Status detection ─────────────────────────────────────────────────────────

export type LexStatus = "amalda" | "kuchini_yoqotgan" | "ozgartirish" | "unknown";

export interface ValidationResult {
  ref:     ArticleRef;
  status:  LexStatus;
  snippet: string;
}

const STATUS_KEYWORDS: { kw: string[]; status: LexStatus }[] = [
  { kw: ["amalda emas", "kuchini yo'qotgan", "bekor qilingan", "o'z kuchini yo'qotgan"], status: "kuchini_yoqotgan" },
  { kw: ["o'zgartirish kiritilgan", "yangi tahrir", "tahririga o'zgartirish", "o'zgartirilgan"], status: "ozgartirish" },
  { kw: ["amalda", "joriy", "kuchda"], status: "amalda" },
];

async function checkArticleStatus(ref: ArticleRef): Promise<ValidationResult> {
  try {
    const encoded = encodeURIComponent(ref.searchQuery);
    const res = await fetch(`https://lex.uz/search?q=${encoded}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SayhaAI/1.0; +https://sayha.uz)" },
      signal: AbortSignal.timeout(7_000),
    });
    if (!res.ok) return { ref, status: "unknown", snippet: "" };

    const html   = await res.text();
    const text   = stripHtml(html).toLowerCase();
    const snippet = stripHtml(html).slice(0, 500);

    for (const { kw, status } of STATUS_KEYWORDS) {
      if (kw.some((k) => text.includes(k))) {
        return { ref, status, snippet };
      }
    }

    return { ref, status: "unknown", snippet };
  } catch (e: any) {
    console.warn(`[lex.uz] validate "${ref.searchQuery}" failed:`, e.message);
    return { ref, status: "unknown", snippet: "" };
  }
}

// ─── Main post-validation function ───────────────────────────────────────────

/**
 * Scans AI response for article references, checks each on lex.uz,
 * returns a warning block to append (empty string if nothing to warn about).
 */
export async function validateArticlesInResponse(aiResponse: string): Promise<string> {
  const refs = extractArticleRefs(aiResponse);
  if (refs.length === 0) return "";

  // Check all refs concurrently
  const results = await Promise.all(refs.map(checkArticleStatus));

  const warnings: string[] = [];
  const outdated = results.filter((r) => r.status === "kuchini_yoqotgan");
  const changed  = results.filter((r) => r.status === "ozgartirish");

  for (const r of outdated) {
    warnings.push(
      `⚠️ **Diqqat!** Lex.uz ma'lumotlariga ko'ra, **${r.ref.docKeyword} ${r.ref.articleNum}-modda** hozirda **kuchini yo'qotgan** (bekor qilingan). ` +
      `Ushbu norma eskirgan bo'lishi mumkin — eng so'nggi qonunchilikni [lex.uz](https://lex.uz/search?q=${encodeURIComponent(r.ref.searchQuery)}) dan tekshiring.`,
    );
  }

  for (const r of changed) {
    warnings.push(
      `📝 **E'tibor bering:** Lex.uz ma'lumotlariga ko'ra, **${r.ref.docKeyword} ${r.ref.articleNum}-modda** ga **o'zgartirish kiritilgan**. ` +
      `Amaldagi tahririga [lex.uz](https://lex.uz/search?q=${encodeURIComponent(r.ref.searchQuery)}) dan qarang.`,
    );
  }

  if (warnings.length === 0) return "";

  return (
    `\n\n---\n\n## 🔍 Lex.uz Amaldagi Holat Tekshiruvi\n\n` +
    warnings.join("\n\n") +
    `\n\n*Ushbu tekshiruv avtomatik tarzda lex.uz rasmiy manbasi orqali amalga oshirildi.*`
  );
}

// ─── Shared HTML stripper ─────────────────────────────────────────────────────

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
