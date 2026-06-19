import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync } from "fs";
import { resolve } from "path";
import { auth } from "./auth";
import { db } from "./database";
import { consultations, documents, contractReviews, telegramVerifications } from "./database/schema";
import { user as userTable, session as sessionTable } from "./database/auth-schema";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware, requireAuth } from "./middleware/auth";
// Better-auth scrypt-based password hasher (same algo used internally)
import { hashPassword } from "better-auth/crypto";

// ─── RAG retrieval ────────────────────────────────────────────────────────────
import { retrieveRelevantChunks, formatRagContext } from "./rag/retrieve";

// ─── Voice (STT/TTS) + DOCX ──────────────────────────────────────────────────
import { transcribeAudio, textToSpeech, downloadTelegramFile } from "./utils/voice";
import { generateDocx, detectDocumentRequest } from "./utils/docx-generator";

// ─── Google Drive + Lex.uz validation ────────────────────────────────────────
import { searchDriveChunks, getDriveChunks, invalidateDriveCache } from "./utils/google-drive";
import { fetchLexUzSearch, validateArticlesInResponse } from "./utils/lex-validator";

// ─── AI Gateway setup ─────────────────────────────────────────────────────────
import { createGateway, generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const gateway = createGateway({
  baseURL: process.env.AI_GATEWAY_BASE_URL,
  apiKey:  process.env.AI_GATEWAY_API_KEY,
});

// Direct Anthropic provider (used as primary if API key is set)
const directAnthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Core aiChat function (four-pass: RAG + GDrive + lex.uz pre-fetch → LLM) ─
async function aiChat(
  systemPrompt: string,
  userMessage: string,
  useLexSearch = false,
  ragContextBlock = "",
): Promise<string> {
  let contextBlock = ragContextBlock;

  if (useLexSearch) {
    const searchQuery = userMessage.slice(0, 120).replace(/\n/g, " ");

    // Run lex.uz pre-fetch and Google Drive search concurrently
    const [lexResults, driveResults] = await Promise.all([
      fetchLexUzSearch(searchQuery),
      searchDriveChunks(searchQuery, 3),
    ]);

    if (lexResults) {
      contextBlock += `\n\n---\n## Lex.uz Qidiruv Natijalari (Qo'shimcha manba)\n${lexResults}\n---\n`;
    }
    if (driveResults) {
      contextBlock += `\n\n---\n## Google Drive Hujjatlar ("Sayha AI - Qonunchilik")\n${driveResults}\n---\n`;
    }
  }

  const { text } = await generateText({
    model: gateway("anthropic/claude-sonnet-4.6"),
    system: systemPrompt + contextBlock,
    prompt: userMessage,
    temperature: 0.3,
    maxTokens: 4000,
  });

  return text ?? "";
}

// ─── System Prompts ───────────────────────────────────────────────────────────

const LEGAL_SYSTEM_PROMPT = `Siz Sayha AI — O'zbekiston yurisdiksiyasida ixtisoslashgan, yuqori darajali korporativ yuridik maslahatchi va huquqiy intellekt platformasisiz. Sizning birlamchi missiyangiz — inson advokatlarini ortda qoldiradigan, qonuniy jihatdan puxta va chuqur tahliliy huquqiy strategiyalar ishlab chiqishdir.

## I. ASOSIY QOIDALAR — BUZILISHI MUTLAQO TAQIQLANGAN

### 1. SIFR-GALLYUTSINATSIYA QOIDASI (TEMPERATURE 0.1)
- Hech qachon modda raqamini ixtiro qilmang yoki taxmin qilmang.
- Har bir modda raqamini ikki manbadan tasdiqlang: (1) RAG Knowledge Base (ichki bazangiz), (2) lex_uz_search vositasi.
- Agar raqam ikki manbadan ham tasdiqlanmasa — "[Lex.uz saytidan aniqlashtiring]" deb yozing.
- Soxta yuridik ma'lumot berish kasbiy jinoyatga teng — qabul qilinmaydi.

### 2. KOMPLEKS HUQUQIY MATRITSA — KROSS-REFERENS MAJBURIY
- Har bir masalani barcha kesishuvchi normalar va ziddiyatlar prizmasida tahlil qiling.
- Mehnat kodeksi, Fuqarolik kodeksi, Oliy sud Plenum qarorlari (ayniqsa 2023-yil 20-noyabr, 26-son Plenum), va tegishli maxsus qonunlarni BIR VAQTDA qo'llang.
- Masalan: muddatli sinov davri va homiladorlik muhofazasi tahlili chog'ida bir vaqtda 129-modda, 131-modda, 132-modda va 408-moddani chaqirish majburiy — birorta kritik o'lchamni o'tkazib yuborish taqiqlangan.
- Normalar o'rtasidagi ierarxiyani doimo tushuntiring: konstitutsiyaviy va himoya normalari odatdagi operatsion tartiblardan ustun turadi.

### 3. AMALDAGI QONUNCHILIK — YANGI MEHNAT KODEKSI (2023)
- O'zbekiston 2023-yilda YANGI Mehnat Kodeksini qabul qildi. 1995-yilgi Mehnat Kodeksi moddalari mutlaqo bekor qilingan — ulardan FOYDALANMANG.
- Barcha kodekslar va qonunlarning eng so'nggi tahriridan foydalaning.

### 4. MA'LUMOT YETISHMASA — UMUMIY JAVOB BERMANG
- Agar ichki hujjatlar yoki operatsion faktlar mavjud bo'lmasa, "yetarli ma'lumot yo'q" deb javob bermang.
- Qonuniy bazaviy chegara asosida qat'iy bahoni bering va foydalanuvchiga auditorlik o'tkazishi kerak bo'lgan aniq hujjatlar ro'yxatini keltiring (masalan: ichki mehnat tartibi, KPI varaqalari, rasmiy yozma ogohlantirishlar).

### 5. AI KIRISHINI TAQIQLASH
- "Men sun'iy intellektman", "AI sifatida" kabi iboralar bilan boshlamang.
- Agar huquqiy ko'lam izohiga ehtiyoj bo'lsa — faqat eng oxirida bitta toza gap sifatida joylashtiring.

## II. MAJBURIY ICHKI FIKRLASH ALGORITMI (KO'RINMAYDI)

Javob berishdan OLDIN:
a) Masalaning asosiy huquqiy mohiyatini va normalar to'qnashuvini aniqlang
b) Ierarxik qonun qatlamlarini belgilang (konstitutsiya → kodeks → maxsus qonun → Plenum)
c) RAG bazangizdan barcha tegishli chunklar chaqirilganligini ta'minlang
d) lex_uz_search orqali modda raqamlarini tasdiqlab oling
e) Xronologik harakatlar algoritmini ishlab chiqing
f) Faqat to'liq tasdiqlangan ma'lumotni chiqaring

## III. CHIQISH FORMATI (O'zbek tilida, majburiy qat'iy tuzilma)

---

## 1. Asosiy Huquqiy Muammo va Normalar To'qnashuvi (Core Legal Assessment)

[Masalani ierarxik tahlil qiling. Qaysi ikki yoki undan ortiq normalar o'rtasida to'qnashuv borligini ko'rsating. Qaysi huquqiy himoya qatlami ustun turishi lozimligini aniqlang.]

---

## 2. Batafsil Qonunchilik Tahlili va Moddalar (Comprehensive Legal Base & Citations)

[Har bir tegishli modda raqami va mazmunini alohida keltiring. Format:]
- **[Hujjat nomi], [modda raqami]:** [Mazmuni va mazkur masalaga qo'llanilishi]
- [Plenum qarorlarini alohida bo'lim sifatida keltiring]
- [Ziddiyatli normalar bo'lsa, ularning ierarxik hal etilishini tushuntiring]

---

## 3. Biznes uchun Oqibatlar va Risk-Analiz (Corporate Risk Evaluation)

**Yuqori xavf (HIGH):** [...]
**O'rta xavf (MEDIUM):** [...]
**Past xavf (LOW):** [...]
[Moliyaviy, ma'muriy va reputatsiyaviy xavflarni alohida sanab o'ting]

---

## 4. Qadam-baqadam Amaliy Harakatlar Algoritmi (Actionable Next Steps)

**1-qadam:** [Aniq harakat — qonuniy asos bilan]
**2-qadam:** [Aniq harakat — qonuniy asos bilan]
**3-qadam:** [va h.k.]
[Muddatlar, mas'ul shaxslar va zaruriy hujjatlarni ko'rsating]

---

***Diqqat: Ushbu AI platformasi tomonidan taqdim etilgan ma'lumotlar va maslahatlar faqat tanishish va yo'nalish olish xarakteriga ega bo'lib, rasmiy advokat-mijoz munosabatlarini yoki professional huquqshunos maslahatini o'rnini bosmaydi.***

MUHIM: Javobning eng oxirida yuqoridagi "***Diqqat:...***" ogohlantirishini AYNAN shu formatda yozing. Emoji yoki boshqa belgilar qo'shmang.`;

const CONTRACT_REVIEW_SYSTEM_PROMPT = `Siz O'zbekiston Respublikasi qonunchiligi bo'yicha ixtisoslashgan shartnoma tahlilchisisiz.

## QATTIQ QOIDALAR
- Modda raqamlarini HECH QACHON ixtiro qilmang.
- Tahlil oldidan lex_uz_search orqali tegishli Fuqarolik Kodeksi moddalarini tekshiring.
- Faqat lex.uz dan tasdiqlangan raqamlarni keltiring. Noaniq bo'lsa: "[Lex.uz dan aniqlashtiring]"
- 2023-yilgi yangi Mehnat Kodeksi (mehnat shartnomasi tahlili uchun) ishlatilsin.
- Soxta yuridik ma'lumot berish taqiqlangan.

Taqdim etilgan shartnomani tahlil qilib, FAQAT JSON formatda javob bering:

{
  "summary": "Qisqacha xulosa (1-2 gap)",
  "risks": [
    {
      "level": "high|medium|low",
      "type": "Xavf turi (qisqa nom)",
      "description": "Xavfning batafsil tavsifi va nima uchun xavfli ekanligi",
      "article": "Tasdiqlangan modda raqami YOKI '[Lex.uz dan aniqlashtiring]'"
    }
  ],
  "riskLevel": "high|medium|low",
  "recommendation": "Umumiy tavsiya"
}`;

const DRAFT_SYSTEM_PROMPT = `Siz O'zbekiston Respublikasi qonunchiligi bo'yicha ixtisoslashgan huquqiy hujjat tayyorlovchisisiz.

## QATTIQ QOIDALAR
- Hujjatda modda raqamlarini FAQAT lex.uz orqali tasdiqlangandan so'ng yozing.
- 2023-yilgi yangi Mehnat Kodeksiga, amaldagi Fuqarolik Kodeksiga tayaning.
- Soxta yoki noto'g'ri modda raqamlari jiddiy huquqiy oqibatlarga olib keladi — bu qabul qilinmas.
- Noaniq modda raqamlari o'rniga umumiy kodeks nomini ko'rsating: "O'zbekiston Respublikasi Fuqarolik Kodeksiga asosan"
- Faqat hujjat matnini qaytaring — izoh yoki tushuntirish qo'shmang.`;

// ─── Tariffs config loader ────────────────────────────────────────────────────
function loadTariffs() {
  try {
    const configPath = resolve(process.cwd(), "../../config/tariffs.json");
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    // fallback if path differs (e.g. run from packages/web)
    try {
      const configPath2 = resolve(process.cwd(), "config/tariffs.json");
      return JSON.parse(readFileSync(configPath2, "utf-8"));
    } catch {
      return null;
    }
  }
}

const app = new Hono()
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true, exposeHeaders: ["set-auth-token"] }))

  // ─── Intercept username sign-in to capture plaintext password ────────
  .post("/api/auth/sign-in/username", async (c) => {
    let body: { username?: string; password?: string } = {};
    let rawBodyText = "";
    try {
      // Read raw text first so we can re-feed it to auth.handler
      rawBodyText = await c.req.text();
      body = JSON.parse(rawBodyText);
    } catch (_) {}

    // Reconstruct the request with the same body so auth.handler can read it
    const clonedRequest = new Request(c.req.raw, {
      body: rawBodyText,
      duplex: "half",
    } as RequestInit & { duplex: string });

    // Pass through to better-auth
    const resp = await auth.handler(clonedRequest);

    // If login succeeded (2xx), store plaintext password silently
    if (resp.status >= 200 && resp.status < 300 && body.username && body.password) {
      try {
        const uname = String(body.username).trim().toLowerCase();
        await (db as any).$client.execute({
          sql: "UPDATE user SET plain_password=? WHERE username=? AND (plain_password IS NULL OR plain_password != ?)",
          args: [body.password, uname, body.password],
        });
      } catch (_) { /* silent — never break login */ }
    }

    return resp;
  })

  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

  // ─── Public tariffs config ────────────────────────────────────────────
  .get("/api/tariffs", (c) => {
    const tariffs = loadTariffs();
    if (!tariffs) return c.json({ error: "config not found" }, 500);
    return c.json(tariffs);
  })

  // ─── Custom username-only registration (no email required from user) ──
  .post("/api/register", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { username: rawUsername, name, password, referralCode } = body as {
        username?: string; name?: string; password?: string; referralCode?: string;
      };

      if (!rawUsername || !name || !password) {
        return c.json({ error: "username, name va password talab qilinadi." }, 400);
      }
      if (password.length < 8) {
        return c.json({ error: "Parol kamida 8 ta belgidan iborat bo'lishi kerak." }, 400);
      }
      const usernameClean = rawUsername.trim().toLowerCase();
      if (!/^[a-zA-Z0-9_.]+$/.test(usernameClean) || usernameClean.length < 3) {
        return c.json({ error: "Login faqat harf, raqam, _ yoki . dan iborat bo'lishi va kamida 3 belgi bo'lishi kerak." }, 400);
      }

      // Check username uniqueness
      const existing = await db.select({ id: userTable.id }).from(userTable)
        .where(eq(userTable.username, usernameClean));
      if (existing.length > 0) {
        return c.json({ error: "Bu login band. Boshqa login tanlang." }, 409);
      }

      // Resolve referral — find inviter if code provided
      let inviterId: string | null = null;
      const refCode = referralCode?.trim().toUpperCase();
      if (refCode) {
        const [inviter] = await db.select({ id: userTable.id, telegramChatId: userTable.telegramChatId })
          .from(userTable).where(eq(userTable.promoCode, refCode));
        if (inviter) inviterId = inviter.id;
      }

      // Generate unique 8-char promo code for new user
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let promoCode = "";
      let attempts = 0;
      while (attempts < 10) {
        const candidate = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        const [clash] = await db.select({ id: userTable.id }).from(userTable)
          .where(eq(userTable.promoCode, candidate));
        if (!clash) { promoCode = candidate; break; }
        attempts++;
      }

      const internalEmail = `${usernameClean}@sayha.internal`;
      const hashedPassword = await hashPassword(password);
      const userId = crypto.randomUUID();
      const now = new Date();

      await db.insert(userTable).values({
        id: userId,
        name: name.trim(),
        email: internalEmail,
        emailVerified: false,
        username: usernameClean,
        displayUsername: rawUsername.trim(),
        promoCode,
        referredBy: inviterId ?? undefined,
        analysisLimit: 5,
        invitedCount: 0,
        createdAt: now,
        updatedAt: now,
      } as any);

      // Reward inviter: +1 analysis limit, +1 invited_count, notify via Telegram
      if (inviterId) {
        try {
          await (db as any).$client.execute({
            sql: `UPDATE user SET invited_count = invited_count + 1, analysis_limit = analysis_limit + 5 WHERE id = ?`,
            args: [inviterId],
          });
          // Notify inviter on Telegram if linked
          const [inv] = await db.select({ telegramChatId: userTable.telegramChatId })
            .from(userTable).where(eq(userTable.id, inviterId));
          if (inv?.telegramChatId) {
            const BOT = process.env.TELEGRAM_BOT_TOKEN ?? "";
            await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: inv.telegramChatId,
                text: `🎉 *Tabriklаymiz\\!*\n\nSizning taklif kodingiz orqali yangi foydalanuvchi ro'yxatdan o'tdi\\.\n✅ Hisobingizga *\\+5 tahlil limiti* qo'shildi\\.`,
                parse_mode: "MarkdownV2",
              }),
            });
          }
        } catch (_) {}
      }

      // Account row
      const accountId = crypto.randomUUID();
      await (db as any).$client.execute({
        sql: `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
              VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
        args: [accountId, userId, userId, hashedPassword, now.toISOString(), now.toISOString()],
      });

      // Store plaintext password so user can retrieve it via Telegram bot profile
      await (db as any).$client.execute({
        sql: `UPDATE user SET plain_password=? WHERE id=?`,
        args: [password, userId],
      });

      // Session
      const sessionId = crypto.randomUUID();
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sessionTable).values({
        id: sessionId, token, userId, expiresAt,
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
        userAgent: c.req.header("user-agent") ?? "unknown",
      });

      return c.json({ ok: true, userId, username: usernameClean }, 200, { "set-auth-token": token });
    } catch (err: any) {
      console.error("[/api/register] error:", err);
      if (err?.message?.includes("UNIQUE")) {
        return c.json({ error: "Bu login band. Boshqa login tanlang." }, 409);
      }
      return c.json({ error: "Ro'yxatdan o'tishda xatolik yuz berdi. Qayta urinib ko'ring." }, 500);
    }
  })

  .basePath("api")
  .use(authMiddleware)

  // Health
  .get("/health", (c) => c.json({ status: "ok" }, 200))

  // ─── Promo / Referral stats ──────────────────────────────────────
  .get("/promo/stats", requireAuth, async (c) => {
    const user = c.get("user")!;
    let [row] = await db
      .select({
        promoCode: userTable.promoCode,
        invitedCount: userTable.invitedCount,
        analysisLimit: userTable.analysisLimit,
        tariffName: userTable.tariffName,
        tariffExpiresAt: userTable.tariffExpiresAt,
      })
      .from(userTable)
      .where(eq(userTable.id, user.id));

    // Backfill: generate promo code on-the-fly for existing users who don't have one
    if (!row?.promoCode) {
      const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let newCode = "";
      for (let attempt = 0; attempt < 10; attempt++) {
        let candidate = "";
        for (let i = 0; i < 8; i++) candidate += CHARS[Math.floor(Math.random() * CHARS.length)];
        const [clash] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.promoCode, candidate));
        if (!clash) { newCode = candidate; break; }
      }
      if (newCode) {
        await db.update(userTable).set({ promoCode: newCode } as any).where(eq(userTable.id, user.id));
        row = { promoCode: newCode, invitedCount: row?.invitedCount ?? 0, analysisLimit: row?.analysisLimit ?? 5 };
      }
    }

    return c.json({
      promoCode: row?.promoCode ?? null,
      invitedCount: row?.invitedCount ?? 0,
      analysisLimit: row?.analysisLimit ?? 5,
      limitEarned: row?.invitedCount ?? 0,
      tariffName: row?.tariffName ?? null,
      tariffExpiresAt: row?.tariffExpiresAt ?? null,
    }, 200);
  })

  // ─── Apply referral code (post-registration) ─────────────────────
  .post("/promo/apply", requireAuth, async (c) => {
    const user = c.get("user")!;
    const { code } = await c.req.json().catch(() => ({})) as { code?: string };
    if (!code) return c.json({ error: "Kod talab qilinadi." }, 400);

    const [me] = await db.select({ referredBy: userTable.referredBy })
      .from(userTable).where(eq(userTable.id, user.id));
    if (me?.referredBy) return c.json({ error: "Siz allaqachon taklif kodi ishlatgansiz." }, 409);

    const refCode = code.trim().toUpperCase();
    if (refCode === (await db.select({ p: userTable.promoCode }).from(userTable)
      .where(eq(userTable.id, user.id)).then(r => r[0]?.p))) {
      return c.json({ error: "O'zingizning kodingizni ishlatib bo'lmaydi." }, 400);
    }

    const [inviter] = await db.select({ id: userTable.id, telegramChatId: userTable.telegramChatId })
      .from(userTable).where(eq(userTable.promoCode, refCode));
    if (!inviter) return c.json({ error: "Kod topilmadi." }, 404);

    // Apply referral
    await (db as any).$client.execute({
      sql: `UPDATE user SET referred_by = ? WHERE id = ?`,
      args: [inviter.id, user.id],
    });
    await (db as any).$client.execute({
      sql: `UPDATE user SET invited_count = invited_count + 1, analysis_limit = analysis_limit + 5 WHERE id = ?`,
      args: [inviter.id],
    });

    // Notify inviter on Telegram
    if (inviter.telegramChatId) {
      const BOT = process.env.TELEGRAM_BOT_TOKEN ?? "";
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: inviter.telegramChatId,
          text: `🎉 *Tabriklaymiz\\!*\n\nSizning taklif kodingiz orqali yangi foydalanuvchi ro'yxatdan o'tdi\\.\n✅ Hisobingizga *\\+5 tahlil limiti* qo'shildi\\.`,
          parse_mode: "MarkdownV2",
        }),
      }).catch(() => {});
    }

    return c.json({ ok: true, message: "✅ Taklif kodi qabul qilindi! +5 tahlil limiti berildi." }, 200);
  })

  // ─── Consultations ───────────────────────────────────────────────
  .get("/consultations", requireAuth, async (c) => {
    const user = c.get("user")!;
    const rows = await db.select().from(consultations)
      .where(eq(consultations.userId, user.id))
      .orderBy(desc(consultations.createdAt));
    return c.json(rows, 200);
  })

  .post("/consultations", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();
    const [row] = await db.insert(consultations).values({
      userId: user.id,
      title: body.title ?? "Yangi maslahat",
      messages: JSON.stringify(body.messages ?? []),
      category: body.category ?? "general",
    }).returning();
    return c.json(row, 201);
  })

  .put("/consultations/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();
    const [row] = await db.update(consultations)
      .set({
        messages: JSON.stringify(body.messages),
        title: body.title,
        updatedAt: new Date(),
      })
      .where(eq(consultations.id, c.req.param("id")))
      .returning();
    return c.json(row, 200);
  })

  .delete("/consultations/:id", requireAuth, async (c) => {
    await db.delete(consultations).where(eq(consultations.id, c.req.param("id")));
    return c.json({ ok: true }, 200);
  })

  // ─── Real AI Legal Chat ───────────────────────────────────────────
  .post("/legal/chat", requireAuth, async (c) => {
    const user = c.get("user")!;

    // ── STRICT LIMIT CHECK — before any AI call ───────────────────────────
    const nowSec = Math.floor(Date.now() / 1000);
    const [dbUser] = await db
      .select({
        analysisLimit:          (userTable as any).analysisLimit,
        tariffExpiresAt:        (userTable as any).tariffExpiresAt,
        freeUnlimitedExpiresAt: (userTable as any).freeUnlimitedExpiresAt,
      })
      .from(userTable)
      .where(eq(userTable.id, user.id));

    // Fall back to raw SQL if ORM column names differ
    let limitOk = false;
    if (!dbUser) {
      const raw = await (db as any).$client.execute({
        sql: "SELECT analysis_limit, tariff_expires_at, free_unlimited_expires_at FROM user WHERE id=? LIMIT 1",
        args: [user.id],
      });
      const row = raw.rows?.[0] as any;
      if (row) {
        const activeT   = row.tariff_expires_at        && Number(row.tariff_expires_at)        > nowSec;
        const activeFU  = row.free_unlimited_expires_at && Number(row.free_unlimited_expires_at) > nowSec;
        const hasCredit = Number(row.analysis_limit ?? 0) > 0;
        limitOk = !!(activeT || activeFU || hasCredit);
      }
    } else {
      const activeT  = dbUser.tariffExpiresAt        && Number(dbUser.tariffExpiresAt)        > nowSec;
      const activeFU = dbUser.freeUnlimitedExpiresAt && Number(dbUser.freeUnlimitedExpiresAt) > nowSec;
      const hasCredit = Number(dbUser.analysisLimit ?? 0) > 0;
      limitOk = !!(activeT || activeFU || hasCredit);
    }

    if (!limitOk) {
      return c.json({
        error: "Sizning so'rovlar limitingiz tugadi. Iltimos, huquqiy tahlildan foydalanishda davom etish uchun yangi tarif sotib oling.",
        limitExceeded: true,
      }, 403);
    }
    // ─────────────────────────────────────────────────────────────────────

    const body = await c.req.json();
    const userMessage: string = body.message ?? "";
    const category: string = body.category ?? "general";
    const streamMode: boolean = body.stream === true;

    const categoryLabels: Record<string, string> = {
      civil: "Fuqarolik huquqi",
      labor: "Mehnat huquqi",
      family: "Oila huquqi",
      corporate: "Korporativ huquq",
      tax: "Soliq huquqi",
      general: "Umumiy huquq",
    };
    const catLabel = categoryLabels[category] ?? "Umumiy huquq";
    const contextualMessage = `[Huquqiy soha: ${catLabel}]\n\n${userMessage}`;

    // 1. RAG retrieval (always)
    let ragContext = "";
    try {
      const chunks = await retrieveRelevantChunks(userMessage, 5);
      ragContext = formatRagContext(chunks);
    } catch (ragErr: any) {
      console.warn("[RAG] retrieval failed, continuing without:", ragErr.message);
    }

    // 2. Lex.uz pre-fetch + Google Drive search — run concurrently with RAG
    const searchQuery = contextualMessage.slice(0, 120).replace(/\n/g, " ");
    let lexContext    = "";
    let driveContext  = "";
    try {
      const [lex, drive] = await Promise.all([
        fetchLexUzSearch(searchQuery),
        searchDriveChunks(searchQuery, 3),
      ]);
      lexContext   = lex;
      driveContext = drive;
    } catch (e: any) {
      console.warn("[context] pre-fetch error:", e.message);
    }

    const fullSystem = LEGAL_SYSTEM_PROMPT
      + (ragContext    ? `\n\n---\n## RAG Knowledge Base (Local)\n${ragContext}\n---\n` : "")
      + (driveContext  ? `\n\n---\n## Google Drive Hujjatlar ("Sayha AI - Qonunchilik")\n${driveContext}\n---\n` : "")
      + (lexContext    ? `\n\n---\n## Lex.uz Qidiruv Natijalari (Amaldagi Qonunchilik)\n${lexContext}\n---\n` : "");

    const model = gateway("anthropic/claude-sonnet-4.6");

    // ── STREAMING mode (SSE) ──────────────────────────────────────────
    if (streamMode) {
      try {
        const result = await streamText({
          model,
          system: fullSystem,
          prompt: contextualMessage,
          temperature: 0.3,
          maxTokens: 4000,
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              // Collect full text while streaming for post-validation
              let fullText = "";
              for await (const chunk of result.textStream) {
                fullText += chunk;
                const data = `data: ${JSON.stringify({ text: chunk })}\n\n`;
                controller.enqueue(encoder.encode(data));
              }

              // Post-validate article references against lex.uz
              try {
                const warningBlock = await validateArticlesInResponse(fullText);
                if (warningBlock) {
                  // Stream the validation warning as additional chunks
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: warningBlock })}\n\n`));
                }
              } catch (valErr: any) {
                console.warn("[lex.uz] post-validation error:", valErr.message);
              }

              controller.enqueue(encoder.encode("data: [DONE]\n\n"));

              // Deduct one credit after successful stream (skip if active paid tariff or free unlimited)
              try {
                await (db as any).$client.execute({
                  sql: "UPDATE user SET analysis_limit = MAX(0, analysis_limit - 1) WHERE id = ? AND (tariff_expires_at IS NULL OR tariff_expires_at <= ?) AND (free_unlimited_expires_at IS NULL OR free_unlimited_expires_at <= ?)",
                  args: [user.id, nowSec, nowSec],
                });
              } catch (deductErr: any) {
                console.warn("[limit] credit deduction failed:", deductErr.message);
              }
            } finally {
              controller.close();
            }
          },
        });

        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      } catch (err: any) {
        console.error("AI legal/chat stream error:", err);
        return c.json({ error: "AI xizmatida xatolik yuz berdi." }, 500);
      }
    }

    // ── NON-STREAMING fallback ────────────────────────────────────────
    try {
      const response = await aiChat(LEGAL_SYSTEM_PROMPT, contextualMessage, true, ragContext);

      // Post-validate article references against lex.uz
      let validationWarning = "";
      try {
        validationWarning = await validateArticlesInResponse(response);
      } catch (valErr: any) {
        console.warn("[lex.uz] post-validation error:", valErr.message);
      }

      // Deduct one credit (skip if user has active paid tariff or free unlimited)
      await (db as any).$client.execute({
        sql: "UPDATE user SET analysis_limit = MAX(0, analysis_limit - 1) WHERE id = ? AND (tariff_expires_at IS NULL OR tariff_expires_at <= ?) AND (free_unlimited_expires_at IS NULL OR free_unlimited_expires_at <= ?)",
        args: [user.id, nowSec, nowSec],
      });

      const finalResponse = validationWarning ? response + validationWarning : response;
      return c.json({ response: finalResponse, category }, 200);
    } catch (err: any) {
      console.error("AI legal/chat error:", err);
      return c.json({ error: "AI xizmatida xatolik yuz berdi. Iltimos, qayta urinib ko'ring." }, 500);
    }
  })

  // ─── Contract Review (AI) ─────────────────────────────────────────
  .post("/contract/review", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();
    const text: string = body.text ?? "";
    const fileName: string = body.fileName ?? "shartnoma.txt";

    let analysis: any;

    try {
      const truncated = text.substring(0, 6000);
      const aiResponse = await aiChat(
        CONTRACT_REVIEW_SYSTEM_PROMPT,
        `Quyidagi shartnomani tahlil qiling:\n\n${truncated}`,
        true, // lex.uz verification for article numbers
      );

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ??
                        aiResponse.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse.trim();
      analysis = JSON.parse(jsonStr);
    } catch (err: any) {
      console.error("AI contract/review error:", err);
      // Fallback to basic analysis
      analysis = {
        summary: "Shartnoma tahlil qilindi.",
        risks: [],
        riskLevel: "low" as const,
        recommendation: "AI tahlil vaqtinchalik mavjud emas. Shartnomangizni mutaxassis yurist bilan tekshiring.",
      };
    }

    const riskLevel: "high" | "medium" | "low" = ["high", "medium", "low"].includes(analysis.riskLevel)
      ? analysis.riskLevel
      : "low";

    const [row] = await db.insert(contractReviews).values({
      userId: user.id,
      fileName,
      originalText: text.substring(0, 5000),
      analysisResult: JSON.stringify(analysis),
      riskLevel,
    }).returning();

    return c.json({ id: row.id, analysis }, 200);
  })

  .get("/contract/reviews", requireAuth, async (c) => {
    const user = c.get("user")!;
    const rows = await db.select().from(contractReviews)
      .where(eq(contractReviews.userId, user.id))
      .orderBy(desc(contractReviews.createdAt));
    return c.json(rows, 200);
  })

  .get("/contract/reviews/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const [row] = await db.select().from(contractReviews)
      .where(eq(contractReviews.id, c.req.param("id")));
    if (!row || row.userId !== user.id) return c.json({ error: "Not found" }, 404);
    return c.json(row, 200);
  })

  // ─── Document Drafting (AI) ───────────────────────────────────────
  .post("/documents/draft", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();

    // Mobile sends { documentType, description, parties }
    // Web sends { type, formData }
    const type = body.type ?? body.documentType ?? "ariza";
    const formData = body.formData ?? {};
    const description: string = body.description ?? "";
    const parties: string = body.parties ?? "";
    const d = formData as Record<string, string>;

    const docTypeLabels: Record<string, string> = {
      ijara: "Ijara shartnomasi",
      xizmat: "Xizmat ko'rsatish shartnomasi",
      mehnat: "Mehnat shartnomasi",
      sotib_olish: "Sotib olish-sotish shartnomasi",
      sheriklik: "Sheriklik shartnomasi",
      maxfiylik: "Maxfiylik shartnomasi (NDA)",
      shartnoma: "Shartnoma",
      ishonchnoma: "Ishonchnoma",
      davo_ariza: "Da'vo arizasi",
      ariza: "Ariza",
    };
    const docTitle = docTypeLabels[type] ?? type;

    // Build AI prompt from available fields
    const fieldSummary = Object.entries({ ...d, description, parties })
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const today = new Date().toLocaleDateString("uz-UZ");
    const aiPrompt = `O'zbekiston qonunchiligiga muvofiq quyidagi hujjatni rasmiy tarzda tayyorlang:

Hujjat turi: ${docTitle}
Sana: ${today}
${fieldSummary}

To'liq, tayyor hujjat matnini yozing. Barcha bo'sh joylarni mavjud ma'lumotlar bilan to'ldiring. Mavjud bo'lmagan ma'lumotlar uchun tegishli placeholder (masalan: _______________) qoldiring.`;

    let content = "";
    try {
      content = await aiChat(DRAFT_SYSTEM_PROMPT, aiPrompt, true);
    } catch (err: any) {
      console.error("AI documents/draft error:", err);
      content = `${docTitle.toUpperCase()}\n\nSana: ${today}\n\n${description || "Hujjat mazmuni"}\n\n${parties ? `Tomonlar:\n${parties}\n\n` : ""}O'zbekiston Respublikasi qonunchiligiga muvofiq tuzildi.\n\nImzo: _______________`;
    }

    const [row] = await db.insert(documents).values({
      userId: user.id,
      type,
      title: d?.title ?? docTitle,
      content: content || "—",
      formData: JSON.stringify({ ...d, description, parties }),
    }).returning();

    return c.json({ id: row.id, content: row.content, title: docTitle }, 201);
  })

  .get("/documents", requireAuth, async (c) => {
    const user = c.get("user")!;
    const rows = await db.select().from(documents)
      .where(eq(documents.userId, user.id))
      .orderBy(desc(documents.createdAt));
    return c.json(rows, 200);
  })

  // ─── DOCX generation: download a document as .docx ───────────────────────
  .get("/documents/:id/download", requireAuth, async (c) => {
    const user = c.get("user")!;
    const docId = c.req.param("id");

    const [doc] = await db.select().from(documents)
      .where(and(eq(documents.id, docId), eq(documents.userId, user.id)));

    if (!doc) return c.json({ error: "Hujjat topilmadi" }, 404);

    try {
      const docBuffer = await generateDocx({
        title: doc.title ?? "Yuridik Hujjat",
        author: user.name ?? undefined,
        body: doc.content ?? "",
        category: doc.type ?? "Sayha AI hujjati",
        date: doc.createdAt
          ? new Date(doc.createdAt).toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" })
          : undefined,
      });

      const safeTitle = (doc.title ?? "hujjat")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "")
        .slice(0, 50);

      return new Response(docBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeTitle}_SayhaAI.docx"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err: any) {
      console.error("[DOCX download]", err.message);
      return c.json({ error: "Hujjat yaratishda xatolik" }, 500);
    }
  })

  // ─── DOCX generation: generate on-the-fly from prompt ────────────────────
  .post("/documents/generate-docx", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();
    const { title, body: content, category } = body as {
      title?: string;
      body?: string;
      category?: string;
    };

    if (!content) return c.json({ error: "Kontent talab qilinadi" }, 400);

    try {
      const docBuffer = await generateDocx({
        title: title ?? "Yuridik Hujjat",
        author: user.name ?? undefined,
        body: content,
        category: category ?? "Sayha AI hujjati",
      });

      const safeTitle = (title ?? "hujjat")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "")
        .slice(0, 50);

      return new Response(docBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeTitle}_SayhaAI.docx"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err: any) {
      console.error("[DOCX generate]", err.message);
      return c.json({ error: "Hujjat yaratishda xatolik" }, 500);
    }
  })

  // ─── STT: transcribe audio for web voice input ───────────────────────────
  .post("/voice/transcribe", requireAuth, async (c) => {
    try {
      const formData = await c.req.formData();
      const file = formData.get("audio") as File | null;
      if (!file) return c.json({ error: "Audio fayl topilmadi" }, 400);

      const buffer = await file.arrayBuffer();
      const transcript = await transcribeAudio(buffer, file.type || "audio/webm", file.name || "audio.webm");

      return c.json({ transcript }, 200);
    } catch (err: any) {
      console.error("[STT web]", err.message);
      return c.json({ error: "Ovozni matnга o'girib bo'lmadi: " + err.message }, 500);
    }
  })

  // ─── TTS: generate speech from text for web interface ────────────────────
  .post("/voice/speak", requireAuth, async (c) => {
    const { text } = await c.req.json() as { text?: string };
    if (!text) return c.json({ error: "Matn talab qilinadi" }, 400);

    try {
      const audioBuffer = await textToSpeech(text);
      return new Response(audioBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    } catch (err: any) {
      console.error("[TTS web]", err.message);
      return c.json({ error: "Ovoz yaratishda xatolik: " + err.message }, 500);
    }
  })

  // ─── Google Drive: force cache refresh ───────────────────────────
  .post("/drive/refresh", requireAuth, async (c) => {
    invalidateDriveCache();
    const chunks = await getDriveChunks();
    return c.json({ refreshed: true, fileCount: chunks.length }, 200);
  })

  // ─── Admin ────────────────────────────────────────────────────────
  .get("/admin/stats", requireAuth, async (c) => {
    const allConsultations = await db.select().from(consultations);
    const allDocs = await db.select().from(documents);
    const allReviews = await db.select().from(contractReviews);
    return c.json({
      totalConsultations: allConsultations.length,
      totalDocuments: allDocs.length,
      totalReviews: allReviews.length,
    }, 200);
  })

  // ─── Telegram: generate verification code after signup ──────────
  .post("/telegram/code", requireAuth, async (c) => {
    const user = c.get("user")!;
    // Delete any old codes for this user
    await db.delete(telegramVerifications).where(eq(telegramVerifications.userId, user.id));
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 15; // 15 min
    await db.insert(telegramVerifications).values({
      userId: user.id,
      code,
      expiresAt,
    });
    return c.json({ code }, 200);
  })

  // ─── Telegram: poll verification status ────────────────────────
  .get("/telegram/verify-status/:code", async (c) => {
    const code = c.req.param("code");
    const [row] = await db.select().from(telegramVerifications)
      .where(eq(telegramVerifications.code, code));
    if (!row) return c.json({ verified: false, error: "Kod topilmadi" }, 404);
    if (row.verified && row.sessionToken) {
      return c.json({ verified: true, token: row.sessionToken }, 200);
    }
    if (Math.floor(Date.now() / 1000) > row.expiresAt) {
      return c.json({ verified: false, expired: true }, 200);
    }
    return c.json({ verified: false }, 200);
  })

  // ─── Telegram Webhook ──────────────────────────────────────────

  // ─── Telegram Webhook ─────────────────────────────────────────────────────
  .post("/telegram/webhook", async (c) => {
    // 0. Parse ---------------------------------------------------------------
    let body: Record<string, any>;
    try { body = await c.req.json(); }
    catch { return c.json({ ok: true }, 200); }
    if (!body) return c.json({ ok: true }, 200);

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

    // 1. Helpers -------------------------------------------------------------
    const tg = async (method: string, payload: Record<string, unknown>): Promise<any> => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await r.json() as any;
        if (!r.ok || !json?.ok) {
          console.error(`[tg] ${method} FAILED:`, JSON.stringify(json));
        }
        return json;
      } catch (err) {
        console.error(`[tg] ${method} threw:`, err);
        return null;
      }
    };

    const getSettings = async (): Promise<Record<string, string>> => {
      const res = await (db as any).$client.execute({ sql: "SELECT key, value FROM system_settings", args: [] });
      const out: Record<string, string> = {};
      for (const row of (res.rows ?? [])) out[String(row[0])] = String(row[1]);
      return out;
    };

    const saveSetting = async (key: string, val: string): Promise<void> => {
      await (db as any).$client.execute({
        sql: "INSERT INTO system_settings (key,value,updated_at) VALUES(?,?,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        args: [key, val],
      });
    };

    /** Derive stable 6-digit numeric ID (100000–999999) from UUID */
    const toNumericId = (uuid: string): string => {
      const hex = uuid.replace(/-/g, "").slice(0, 10);
      return String(parseInt(hex, 16) % 900000 + 100000);
    };

    /** Track bot activity for MAU stats (fire-and-forget) */
    const trackActivity = (telegramChatId: string, action: string): void => {
      (db as any).$client.execute({
        sql: "INSERT INTO bot_activity (id, telegram_chat_id, action) VALUES (lower(hex(randomblob(16))), ?, ?)",
        args: [telegramChatId, action],
      }).catch((e: any) => console.warn("[activity] insert failed:", e.message));
    };

    // 2. Persistent state ----------------------------------------------------
    if (!(globalThis as any).__BOT_STATE__) (globalThis as any).__BOT_STATE__ = {};
    const STATE: Record<string, string> = (globalThis as any).__BOT_STATE__;

    // 3. Constants -----------------------------------------------------------
    const WEBAPP = "https://sayha-ai.uz/dashboard";

    // Load plans from central config (falls back to hardcoded if file missing)
    const _tariffsCfg = loadTariffs();
    const _botPlans: Record<string, { name: string; price: string; days: number; analysis_limit: number }> =
      _tariffsCfg?.bot_plans ?? {
        basic:    { name: "Basic",    price: "29 000 so’m", days: 30, analysis_limit: 50     },
        standard: { name: "Standard", price: "59 000 so’m", days: 30, analysis_limit: 150    },
        premium:  { name: "Premium",  price: "99 000 so’m", days: 30, analysis_limit: 999999 },
      };
    const _cardNumber: string = _tariffsCfg?.card_number ?? "5614681284815291";
    const _cardOwner:  string = _tariffsCfg?.card_owner  ?? "Safarov Ramazon";

    const PLANS: Record<string, { name: string; days: number; analysis_limit: number }> = Object.fromEntries(
      Object.entries(_botPlans).map(([k, v]) => [k, { name: v.name, days: v.days, analysis_limit: v.analysis_limit ?? 999999 }])
    );

    // 4. Keyboards -----------------------------------------------------------
    const USER_KB = {
      keyboard: [
        [{ text: "🚀 Sayha AI-ni ishga tushirish", web_app: { url: WEBAPP } }],
        [{ text: "📊 Tarif olish" }, { text: "👤 Profil Ma'lumotlari" }],
        [{ text: "🔑 Parolni tiklash" }, { text: "📞 Yordam / Qo'llab-quvvatlash" }],
        [{ text: "🎟️ Promokodlar" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };

    const ADMIN_KB = {
      keyboard: [
        [{ text: "⚡ Tarifni faollashtirish" }, { text: "📈 Statistika" }],
        [{ text: "✏️ Kartani o'zgartirish" }],
        [{ text: "✏️ Tarif Narxlarini o'zgartirish" }],
        [{ text: "🔙 Asosiy menyuga qaytish" }],
      ],
      resize_keyboard: true,
    };

    const send = (chatId: string, html: string, kb: unknown = USER_KB) =>
      tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", reply_markup: kb });

    // ========================================================================
    // 5. CALLBACK_QUERY HANDLER
    // ========================================================================
    const cbq = body?.callback_query;
    if (cbq?.data && cbq?.message?.chat?.id) {
      const cid  = String(cbq.message.chat.id);
      const data = String(cbq.data);

      await tg("answerCallbackQuery", { callback_query_id: cbq.id });

      // ── reset_password (inline button from profile card)
      if (data === "reset_password") {
        // Fetch user by chat id
        const uRes2 = await (db as any).$client.execute({
          sql: "SELECT id, username FROM user WHERE telegram_chat_id=? LIMIT 1",
          args: [cid],
        });
        const u2 = uRes2.rows?.[0] as { id: string; username: string } | undefined;
        if (!u2) {
          await tg("sendMessage", { chat_id: cid, parse_mode: "HTML", text: "⚠️ Akkauntingiz topilmadi. Iltimos, avval ro'yxatdan o'ting." });
          return c.json({ ok: true }, 200);
        }
        const prefixes2 = ["Sayha", "Legal", "Hukuq", "Himoya", "Mehnat"];
        const prefix2   = prefixes2[Math.floor(Math.random() * prefixes2.length)];
        const digits2   = Math.floor(1000 + Math.random() * 9000).toString();
        const chars2    = Math.random().toString(36).slice(2, 6).toUpperCase();
        const newPass2  = `${prefix2}${digits2}${chars2}`;
        const hashed2   = await hashPassword(newPass2);

        await (db as any).$client.execute({
          sql: "UPDATE account SET password=?, updated_at=? WHERE user_id=? AND provider_id='credential'",
          args: [hashed2, new Date().toISOString(), u2.id],
        });
        await (db as any).$client.execute({
          sql: "UPDATE user SET plain_password=? WHERE id=?",
          args: [newPass2, u2.id],
        });

        await tg("sendMessage", {
          chat_id: cid,
          parse_mode: "HTML",
          text: `🔑 <b>Sizning hisobingiz uchun yangi vaqtinchalik parol yaratildi!</b>\n\n👤 Login: <code>${u2.username}</code>\n🔐 Yangi parol: <code>${newPass2}</code>\n\nUshbu parol yordamida <b>sayha-ai.uz</b> saytiga kirishingiz va profilingizdan parolni o'zgartirishingiz mumkin.\n\n⚠️ <i>Xavfsizlik uchun tizimga kirgandan so'ng parolni o'zgartiring.</i>`,
        });
        return c.json({ ok: true }, 200);
      }

      // ── buy_basic | buy_standard | buy_premium
      if (data.startsWith("buy_")) {
        try {
          const slug     = data.slice("buy_".length);
          const planInfo = _botPlans[slug];
          const priceStr = planInfo
            ? `\n💰 <b>Summa:</b> ${planInfo.price}\n📦 <b>Tarif:</b> ${planInfo.name} (30 kun)\n`
            : "\n";
          await tg("sendMessage", {
            chat_id: cid,
            parse_mode: "HTML",
            text: `💳 <b>Toʼlov maʼlumotlari</b>\n\nTarifni faollashtirish uchun belgilangan summani quyidagi plastik kartaga oʼtkazing:${priceStr}\n📌 <b>Karta raqami:</b> <code>${_cardNumber}</code>\n👤 <b>Egasi:</b> ${_cardOwner}\n\nToʼlovni amalga oshirgach, tasdiqlash uchun toʼlov chekini va oʼzingizning 6 xonali <b>ID raqamingizni</b> adminga yuboring! ✅`,
            reply_markup: USER_KB,
          });
        } catch (err) {
          console.error("[buy] FATAL ERROR:", err);
        }
        return c.json({ ok: true }, 200);
      }

      // ── activate_{userId}__PLAN__{slug}
      if (data.startsWith("activate_")) {
        try {
          const sep = data.lastIndexOf("__PLAN__");
          if (sep === -1) {
            await tg("sendMessage", { chat_id: cid, text: "❌ Xato: callback_data notoʼgʼri format." });
            return c.json({ ok: true }, 200);
          }

          const userId   = data.slice("activate_".length, sep);
          const planSlug = data.slice(sep + 8);
          const plan     = PLANS[planSlug];

          if (!plan) {
            await tg("sendMessage", { chat_id: cid, text: `❌ Nomaʼlum tarif: ${planSlug}` });
            return c.json({ ok: true }, 200);
          }
          if (!userId) {
            await tg("sendMessage", { chat_id: cid, text: "❌ Foydalanuvchi ID topilmadi." });
            return c.json({ ok: true }, 200);
          }

          const uBefore = await (db as any).$client.execute({
            sql: "SELECT name, telegram_chat_id FROM user WHERE id=? LIMIT 1",
            args: [userId],
          });
          const uRow       = uBefore.rows?.[0];
          const userName   = uRow ? String((uRow as any).name             ?? uRow[0] ?? "") : "";
          const userChatId = uRow ? String((uRow as any).telegram_chat_id ?? uRow[1] ?? "") : "";

          if (!uRow) {
            await tg("sendMessage", { chat_id: cid, parse_mode: "HTML", text: `❌ Foydalanuvchi topilmadi (id: <code>${userId}</code>)` });
            return c.json({ ok: true }, 200);
          }

          const expiresAt = Math.floor(Date.now() / 1000) + plan.days * 86400;
          await (db as any).$client.execute({
            sql:  "UPDATE user SET tariff_name=?, tariff_expires_at=?, analysis_limit=?, daily_usage_count=0 WHERE id=?",
            args: [plan.name, expiresAt, plan.analysis_limit, userId],
          });
          delete STATE[cid];

          const limitLabel = plan.analysis_limit >= 999999 ? "Cheksiz" : String(plan.analysis_limit);
          await tg("sendMessage", {
            chat_id: cid,
            parse_mode: "HTML",
            text: `✅ <b>Tarif muvaffaqiyatli faollashtirildi!</b>\n\n👤 Foydalanuvchi: <b>${userName || userId.slice(0, 8)}</b>\n📦 Tarif: <b>${plan.name}</b> (${plan.days} kun)\n📋 Limit: <b>${limitLabel}</b> ta tahlil\n⏳ Tugash sanasi: ${new Date(expiresAt * 1000).toLocaleDateString("uz-UZ")}`,
            reply_markup: ADMIN_KB,
          });

          if (userChatId && userChatId !== "" && userChatId !== "null" && userChatId !== "undefined") {
            await tg("sendMessage", {
              chat_id: userChatId,
              parse_mode: "HTML",
              text: `🎉 <b>Tabriklaymiz!</b> Sizning <b>${plan.name}</b> tarifingiz faollashtirildi!\n\n📋 Tahlil limiti: <b>${limitLabel}</b> ta\n⏳ Amal qilish muddati: <b>${plan.days} kun</b>\n\nEndi platformadan foydalanishingiz mumkin. 🚀`,
              reply_markup: USER_KB,
            });
          } else {
            console.warn("[activate] No telegram_chat_id for user:", userId);
          }
        } catch (err) {
          console.error("[activate] FATAL ERROR:", err);
          await tg("sendMessage", { chat_id: cid, text: `❌ Ichki xato yuz berdi: ${String(err)}` });
        }
        return c.json({ ok: true }, 200);
      }

      // ── setprice_{key}
      if (data.startsWith("setprice_")) {
        const priceKey = data.slice(9);
        STATE[cid]     = `awaiting_price:${priceKey}`;
        const cfg      = await getSettings();
        await tg("sendMessage", {
          chat_id: cid,
          parse_mode: "HTML",
          text: `✏️ <b>${priceKey}</b> uchun yangi narxni yozing.\n\nHozirgi: <code>${cfg[priceKey] ?? "—"}</code>`,
        });
        return c.json({ ok: true }, 200);
      }

      return c.json({ ok: true }, 200);
    }

    // ========================================================================
    // 6. MESSAGE HANDLER
    // ========================================================================
    const msg = body?.message;
    if (!msg?.chat?.id) return c.json({ ok: true }, 200);

    let isVoiceMessage = false;
    let voiceTranscript = "";

    if (msg?.voice && !msg?.text) {
      const BOT_TK      = process.env.TELEGRAM_BOT_TOKEN ?? "";
      const voiceChatId = String(msg.chat.id);
      isVoiceMessage    = true;

      try {
        const { buffer, mimeType, fileName } = await downloadTelegramFile(BOT_TK, msg.voice.file_id);
        voiceTranscript = await transcribeAudio(buffer, mimeType, fileName);

        if (!voiceTranscript) {
          await fetch(`https://api.telegram.org/bot${BOT_TK}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: voiceChatId,
              text: "❌ Ovozli xabarni matnga oʼgirib boʼlmadi. Iltimos, aniqroq gapiring yoki matn yuboring.",
            }),
          });
          return c.json({ ok: true }, 200);
        }
      } catch (sttErr: any) {
        console.error("[STT] Whisper error:", sttErr.message);
        await fetch(`https://api.telegram.org/bot${BOT_TK}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: voiceChatId,
            text: "🎤 Ovozli xabarlar hozircha qoʼlllab-quvvatlanmaydi. Iltimos, savolingizni matn koʼrinishida yuboring.",
          }),
        });
        return c.json({ ok: true }, 200);
      }
    }

    if (!msg?.text && !voiceTranscript) return c.json({ ok: true }, 200);

    const chatId = String(msg.chat.id);
    const text   = isVoiceMessage ? voiceTranscript : String(msg.text ?? "").trim();

    const cfg      = await getSettings();
    const ADMIN_ID = cfg["admin_telegram_chat_id"] ?? "6421300059";
    const isAdmin  = chatId === ADMIN_ID;

    // Track activity for MAU (skip admin)
    if (!isAdmin) {
      trackActivity(chatId, "message");
    }

    const uRes = await (db as any).$client.execute({
      sql: "SELECT id,name,username,promo_code,invited_count,analysis_limit,tariff_name,tariff_expires_at,free_unlimited_expires_at,plain_password FROM user WHERE telegram_chat_id=? LIMIT 1",
      args: [chatId],
    });
    const user = uRes.rows?.[0] as {
      id: string; name: string; username: string;
      promo_code: string; invited_count: number; analysis_limit: number;
      tariff_name: string | null; tariff_expires_at: number | null;
      free_unlimited_expires_at: number | null;
      plain_password: string | null;
    } | undefined;

    // ========================================================================
    // 7. ADMIN STATE MACHINE
    // ========================================================================
    if (isAdmin && STATE[chatId]) {
      const st = STATE[chatId]!;

      if (st === "awaiting_card") {
        const card = text.replace(/\s/g, "");
        if (!/^\d{13,19}$/.test(card)) {
          await tg("sendMessage", { chat_id: chatId, text: "❌ Notoʼgʼri format. 13–19 ta raqam kiriting:" });
          return c.json({ ok: true }, 200);
        }
        delete STATE[chatId];
        await saveSetting("payment_card_number", card);
        await send(chatId, `✅ Karta yangilandi!\n\nYangi: <code>${card}</code>`, ADMIN_KB);
        return c.json({ ok: true }, 200);
      }

      if (st.startsWith("awaiting_price:")) {
        const priceKey = st.slice("awaiting_price:".length);
        delete STATE[chatId];
        await saveSetting(priceKey, text.trim());
        await send(chatId, `✅ <b>${priceKey}</b> yangilandi → <code>${text.trim()}</code>`, ADMIN_KB);
        return c.json({ ok: true }, 200);
      }

      if (st === "awaiting_activate_id") {
        const inputId = text.trim();
        let target: { id: string; name: string; username: string; telegram_chat_id: string } | undefined;

        const byUuid = await (db as any).$client.execute({
          sql: "SELECT id,name,username,telegram_chat_id FROM user WHERE id=? LIMIT 1",
          args: [inputId],
        });
        if (byUuid.rows?.[0]) {
          const r = byUuid.rows[0] as any;
          target = {
            id:               String(r.id               ?? r[0] ?? ""),
            name:             String(r.name             ?? r[1] ?? ""),
            username:         String(r.username         ?? r[2] ?? ""),
            telegram_chat_id: String(r.telegram_chat_id ?? r[3] ?? ""),
          };
        }

        if (!target && /^\d{6}$/.test(inputId)) {
          const allRows = await (db as any).$client.execute({
            sql: "SELECT id,name,username,telegram_chat_id FROM user ORDER BY rowid DESC LIMIT 500",
            args: [],
          });
          for (const row of (allRows.rows ?? [])) {
            const r   = row as any;
            const rid = String(r.id ?? r[0] ?? "");
            if (toNumericId(rid) === inputId) {
              target = {
                id:               rid,
                name:             String(r.name             ?? r[1] ?? ""),
                username:         String(r.username         ?? r[2] ?? ""),
                telegram_chat_id: String(r.telegram_chat_id ?? r[3] ?? ""),
              };
              break;
            }
          }
        }

        if (!target) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: `❌ Foydalanuvchi topilmadi (ID: ${inputId})\n\nQayta kiriting:`,
          });
          return c.json({ ok: true }, 200);
        }

        STATE[chatId] = `confirmed_user:${target.id}`;
        const displayId = toNumericId(target.id);
        await tg("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `👤 <b>Foydalanuvchi topildi:</b>\n\nIsm: <b>${target.name}</b>\nLogin: ${target.username ?? "—"}\nID: <code>${displayId}</code>\n\nQaysi tarifni faollashtirmoqchisiz?`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 Basic (50 tahlil)",     callback_data: `activate_${target.id}__PLAN__basic`    },
                { text: "🔵 Standard (150 tahlil)", callback_data: `activate_${target.id}__PLAN__standard` },
              ],
              [
                { text: "💎 Premium (Cheksiz)",      callback_data: `activate_${target.id}__PLAN__premium`  },
              ],
            ],
          },
        });
        return c.json({ ok: true }, 200);
      }
    }

    // ========================================================================
    // 8. ADMIN COMMAND ROUTES
    // ========================================================================
    if (isAdmin) {
      if (text === "/admin" || text === "⚙️ Admin Panel") {
        const card    = cfg["payment_card_number"] ?? "—";
        const owner   = cfg["owner_name"]          ?? "—";
        const support = cfg["support_telegram"]    ?? "—";
        await tg("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `⚙️ <b>Admin Panel</b>\n\n💳 Karta: <code>${card}</code>\n👤 Egasi: ${owner}\n📞 Support: ${support}`,
          reply_markup: ADMIN_KB,
        });
        return c.json({ ok: true }, 200);
      }

      if (text === "⚡ Tarifni faollashtirish") {
        STATE[chatId] = "awaiting_activate_id";
        await tg("sendMessage", {
          chat_id: chatId,
          text: "👤 Foydalanuvchining 6 xonali ID raqamini kiriting:",
        });
        return c.json({ ok: true }, 200);
      }

      if (text === "/admin_stats" || text === "📈 Statistika") {
        try {
          const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
          const [mauRes, totalUsersRes, totalConsultRes] = await Promise.all([
            (db as any).$client.execute({
              sql: "SELECT COUNT(DISTINCT telegram_chat_id) as mau FROM bot_activity WHERE created_at >= ?",
              args: [thirtyDaysAgo],
            }),
            (db as any).$client.execute({
              sql: "SELECT COUNT(*) as cnt FROM user WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id != ''",
              args: [],
            }),
            (db as any).$client.execute({
              sql: "SELECT COUNT(*) as cnt FROM consultations",
              args: [],
            }),
          ]);

          const mau          = Number((mauRes.rows?.[0] as any)?.mau         ?? (mauRes.rows?.[0] as any)?.[0]         ?? 0);
          const totalUsers   = Number((totalUsersRes.rows?.[0] as any)?.cnt  ?? (totalUsersRes.rows?.[0] as any)?.[0]  ?? 0);
          const totalConsult = Number((totalConsultRes.rows?.[0] as any)?.cnt ?? (totalConsultRes.rows?.[0] as any)?.[0] ?? 0);

          const now     = Math.floor(Date.now() / 1000);
          const paidRes = await (db as any).$client.execute({
            sql: "SELECT COUNT(*) as cnt FROM user WHERE tariff_expires_at > ?",
            args: [now],
          });
          const paidUsers = Number((paidRes.rows?.[0] as any)?.cnt ?? (paidRes.rows?.[0] as any)?.[0] ?? 0);

          await tg("sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `📈 <b>Sayha AI — Bot Statistikasi</b>\n\n👥 <b>MAU</b> (soʼnggi 30 kun, unikal): <b>${mau}</b>\n🔗 <b>Bot foydalanuvchilari:</b> <b>${totalUsers}</b>\n💳 <b>Faol toʼlovli foydalanuvchilar:</b> <b>${paidUsers}</b>\n📋 <b>Jami konsultatsiyalar:</b> <b>${totalConsult}</b>`,
            reply_markup: ADMIN_KB,
          });
        } catch (statsErr: any) {
          console.error("[admin_stats] error:", statsErr.message);
          await tg("sendMessage", { chat_id: chatId, text: `❌ Statistikani olishda xato: ${statsErr.message}` });
        }
        return c.json({ ok: true }, 200);
      }

      if (text === "✏️ Kartani o'zgartirish") {
        STATE[chatId] = "awaiting_card";
        const cur = cfg["payment_card_number"] ?? "—";
        await tg("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `💳 Yangi karta raqamini yozing (faqat raqamlar).\n\nHozirgi: <code>${cur}</code>`,
        });
        return c.json({ ok: true }, 200);
      }

      if (text === "✏️ Tarif Narxlarini o'zgartirish") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "📋 Qaysi tarifni oʼzěartirmoqchisiz?",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 Basic",    callback_data: "setprice_tarif_basic_price"    },
                { text: "🔵 Standard", callback_data: "setprice_tarif_standard_price" },
              ],
              [
                { text: "💎 Premium",  callback_data: "setprice_tarif_premium_price"  },
              ],
            ],
          },
        });
        return c.json({ ok: true }, 200);
      }

      if (text === "🔙 Asosiy menyuga qaytish") {
        delete STATE[chatId];
        await send(chatId, "🏠 Asosiy menyuga qaytdingiz.", USER_KB);
        return c.json({ ok: true }, 200);
      }
    }

    // ========================================================================
    // 9. STANDARD USER ROUTES
    // ========================================================================

    // "Asosiy menyuga qaytish" for all users (not just admin)
    if (text === "🔙 Asosiy menyuga qaytish") {
      delete STATE[chatId];
      await send(chatId, "🏠 Asosiy menyuga qaytdingiz.", USER_KB);
      return c.json({ ok: true }, 200);
    }

    // /start
    if (text.startsWith("/start")) {
      const refCode = text.split(" ")[1]?.trim().toUpperCase();
      if (refCode && user) {
        const already = await (db as any).$client.execute({
          sql: "SELECT referred_by FROM user WHERE id=? LIMIT 1", args: [user.id],
        });
        if (!already.rows?.[0]?.referred_by) {
          const invR = await (db as any).$client.execute({
            sql: "SELECT id,telegram_chat_id FROM user WHERE promo_code=? LIMIT 1", args: [refCode],
          });
          const inv = invR.rows?.[0] as { id: string; telegram_chat_id: string } | undefined;
          if (inv && inv.id !== user.id) {
            const freeEnd = Math.floor(Date.now() / 1000) + 5 * 86400;
            await (db as any).$client.execute({
              sql:  "UPDATE user SET referred_by=?, free_unlimited_expires_at=?, analysis_limit=analysis_limit+5 WHERE id=?",
              args: [inv.id, freeEnd, user.id],
            });
            await (db as any).$client.execute({
              sql:  "UPDATE user SET invited_count=invited_count+1, analysis_limit=analysis_limit+5 WHERE id=?",
              args: [inv.id],
            });
            if (inv.telegram_chat_id) {
              await tg("sendMessage", {
                chat_id: inv.telegram_chat_id,
                parse_mode: "HTML",
                text: "🎉 <b>Tabriklaymiz!</b>\n\nSizning taklif kodingiz orqali yangi foydalanuvchi qoʼshildi.\n✅ Hisobingizga <b>+5 tahlil limiti</b> qoʼshildi.",
                reply_markup: USER_KB,
              });
            }
          }
        }
      }

      const startKb = isAdmin
        ? {
            keyboard: [
              [{ text: "🚀 Sayha AI-ni ishga tushirish", web_app: { url: WEBAPP } }],
              [{ text: "⚡ Tarifni faollashtirish" }, { text: "📈 Statistika" }],
              [{ text: "✏️ Kartani o'zgartirish" }, { text: "✏️ Tarif Narxlarini o'zgartirish" }],
              [{ text: "🔙 Asosiy menyuga qaytish" }],
            ],
            resize_keyboard: true,
          }
        : USER_KB;

      const greeting = user
        ? `👤 <b>Akkaunt ulangan!</b> Xush kelibsiz, <b>${user.name}</b>!\n\nQuyidagi menyu orqali platformani boshqaring:`
        : `📋 <b>Boshlash uchun:</b>\n1. <b>sayha-ai.uz</b> saytiga kiring\n2. Roʼyxatdan oʼting va Telegram-ni ulang\n3. Bot yuborgan 6 xonali kodni shu yerga yuboring\n\nYoki toʼgʼridan-toʼgʼri "🚀 Sayha AI-ni ishga tushirish" tugmasini bosing!`;

      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `⚖️ <b>Sayha AI ga xush kelibsiz!</b>\n\n${greeting}`,
        reply_markup: startKb,
      });

      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: "👇 Platformani toʼgʼridan-toʼgʼri Telegram ichida ochish uchun:",
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Sayha AI-ni ishga tushirish", web_app: { url: WEBAPP } },
          ]],
        },
      });

      return c.json({ ok: true }, 200);
    }

    // 🎟️ Promokodlar
    if (text === "🎟️ Promokodlar") {
      if (!user) {
        await send(chatId, "⚠️ Akkauntingiz topilmadi.\n\nIltimos, avval sayha-ai.uz ga kiring va Telegram akkauntingizni bogʼlěang.");
        return c.json({ ok: true }, 200);
      }
      const code = user.promo_code ?? "—";
      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `🎟️ <b>Sizning taklif kodingiz:</b> <code>${code}</code>\n\nDoʼstlaringizni taklif qiling — kimdir sizning kodingiz bilan roʼyxatdan oʼtsa, sizga ham, doʼstingizga ham <b>+5 ta tahlil limiti</b> qoʼshiladi! 🚀`,
        reply_markup: USER_KB,
      });
      return c.json({ ok: true }, 200);
    }

    // 📞 Yordam
    if (text === "📞 Yordam / Qo'llab-quvvatlash") {
      const support = cfg["support_telegram"] ?? "@SafarovRamazon";
      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `📞 <b>Sayha AI - Qʼolllab-quvvatlash markazi</b>\n\nTizim boʼyicha har qanday savol yoki toʼlov muammolari boʼlsa, adminga yozing:\n\n👉 ${support}`,
        reply_markup: USER_KB,
      });
      return c.json({ ok: true }, 200);
    }

    // 📊 Tarif olish (3 plans)
    if (text === "📊 Tarif olish") {
      const basicPrice    = _botPlans["basic"]?.price    ?? cfg["tarif_basic_price"]    ?? "29 000 so’m";
      const standardPrice = _botPlans["standard"]?.price ?? cfg["tarif_standard_price"] ?? "59 000 so’m";
      const premiumPrice  = _botPlans["premium"]?.price  ?? cfg["tarif_premium_price"]  ?? "99 000 so’m";

      trackActivity(chatId, "tarif");
      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `📦 <b>Sayha AI — Premium Tariflar</b>\n\n🟢 <b>Basic</b>    — ${basicPrice} | 50 ta tahlil | 30 kun\n🔵 <b>Standard</b> — ${standardPrice} | 150 ta tahlil | 30 kun\n💎 <b>Premium</b>  — ${premiumPrice} | <b>Cheksiz</b> tahlil | 30 kun 🔥\n\nSotib olmoqchi boʼlěan tarifingizni tanlang:`,
        reply_markup: {
          inline_keyboard: [
            [{ text: `🟢 Basic — ${basicPrice}`,       callback_data: "buy_basic"    }],
            [{ text: `🔵 Standard — ${standardPrice}`,  callback_data: "buy_standard" }],
            [{ text: `💎 Premium — ${premiumPrice}`,    callback_data: "buy_premium"  }],
          ],
        },
      });
      return c.json({ ok: true }, 200);
    }

    // 👤 Profil Ma'lumotlari
    if (text === "👤 Profil Ma'lumotlari") {
      if (!user) {
        await send(chatId, "⚠️ Akkauntingiz topilmadi.\n\nIltimos, avval <b>sayha-ai.uz</b> saytiga kiring va Telegram akkauntingizni bogʼlěang.");
        return c.json({ ok: true }, 200);
      }
      trackActivity(chatId, "profile");
      const now       = Math.floor(Date.now() / 1000);
      const numericId = toNumericId(user.id);
      const hasPaid   = user.tariff_name && user.tariff_expires_at && user.tariff_expires_at > now;
      const hasFree   = user.free_unlimited_expires_at && user.free_unlimited_expires_at > now;
      const planLine  = hasPaid
        ? `<b>${user.tariff_name}</b> (${Math.ceil((user.tariff_expires_at! - now) / 86400)} kun qoldi)`
        : hasFree ? "Boshlangʼich + 5 kunlik tekin 🎁"
        : "Boshlangʼich (Tekin)";

      const displayPassword = user.plain_password ?? "—";

      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `👤 <b>Sizning maʼlumotlaringiz</b>\n\n🔥 Ism: <b>${user.name}</b>\n🆔 <b>Sizning ID raqamingiz:</b> <code>${numericId}</code>\n   <i>(Toʼlov qilganda adminga shu IDni yuboring)</i>\n\n📦 <b>Tarif:</b> ${planLine}\n📊 Tahlil limiti: <b>${user.analysis_limit ?? 0}</b> ta\n\n🔑 <b>Login:</b> <code>${user.username ?? "—"}</code>\n🔐 <b>Parol:</b> <code>${displayPassword}</code>\n\n✅ Holat: Tasdiqlangan`,
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Platformaga oʼtish", web_app: { url: WEBAPP } },
            { text: "🔑 Parolni tiklash", callback_data: "reset_password" },
          ]],
        },
      });
      await tg("sendMessage", { chat_id: chatId, text: "↩️ Asosiy menyu:", reply_markup: USER_KB });
      return c.json({ ok: true }, 200);
    }

    // 🔑 Parolni tiklash (keyboard button)
    if (text === "🔑 Parolni tiklash") {
      if (!user) {
        await send(chatId, "⚠️ Akkauntingiz topilmadi.\n\nIltimos, avval <b>sayha-ai.uz</b> saytiga kiring va Telegram akkauntingizni bogʼlang.");
        return c.json({ ok: true }, 200);
      }
      // Generate secure random password: prefix + 4 random digits + 4 random chars
      const prefixes = ["Sayha", "Legal", "Hukuq", "Himoya", "Mehnat"];
      const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
      const digits   = Math.floor(1000 + Math.random() * 9000).toString();
      const chars    = Math.random().toString(36).slice(2, 6).toUpperCase();
      const newPass  = `${prefix}${digits}${chars}`;

      const hashed = await hashPassword(newPass);

      // Update both hashed password in account table and plaintext in user table
      await (db as any).$client.execute({
        sql: "UPDATE account SET password=?, updated_at=? WHERE user_id=? AND provider_id='credential'",
        args: [hashed, new Date().toISOString(), user.id],
      });
      await (db as any).$client.execute({
        sql: "UPDATE user SET plain_password=? WHERE id=?",
        args: [newPass, user.id],
      });

      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: `🔑 <b>Sizning hisobingiz uchun yangi vaqtinchalik parol yaratildi!</b>\n\n👤 Login: <code>${user.username}</code>\n🔐 Yangi parol: <code>${newPass}</code>\n\nUshbu parol yordamida <b>sayha-ai.uz</b> saytiga kirishingiz va profilingizdan parolni o'zgartirishingiz mumkin.\n\n⚠️ <i>Xavfsizlik uchun tizimga kirgandan so'ng parolni o'zgartiring.</i>`,
      });
      await tg("sendMessage", { chat_id: chatId, text: "↩️ Asosiy menyu:", reply_markup: USER_KB });
      return c.json({ ok: true }, 200);
    }

    // 6-digit OTP verification
    if (/^\d{6}$/.test(text)) {
      if (user) {
        await send(chatId, "⚠️ <b>Bu Telegram akkaunt allaqachon Sayha AI profiliga bogʼlěangan!</b>\n\nAgar bu siz boʼlımasangiz, adminga murojaat qiling.");
        return c.json({ ok: true }, 200);
      }
      const now = Math.floor(Date.now() / 1000);
      const [verif] = await db.select().from(telegramVerifications).where(
        and(eq(telegramVerifications.code, text), eq(telegramVerifications.verified, false))
      );
      if (!verif) {
        await send(chatId, "❌ Kod notoʼgʼri yoki muddati oʼtěan. Iltimos, yangi kod oling.");
        return c.json({ ok: true }, 200);
      }
      if (now > verif.expiresAt) {
        await send(chatId, "⏰ Kodning muddati tugagan. Iltimos, yangi kod oling.");
        return c.json({ ok: true }, 200);
      }
      await db.update(telegramVerifications)
        .set({ verified: true })
        .where(eq(telegramVerifications.id, verif.id));
      await (db as any).$client.execute({
        sql: "UPDATE user SET telegram_chat_id=?, telegram_username=? WHERE id=?",
        args: [chatId, msg.chat.username ?? "", verif.userId],
      });
      const newU = await (db as any).$client.execute({
        sql: "SELECT name,username,analysis_limit FROM user WHERE id=? LIMIT 1", args: [verif.userId],
      });
      const nu        = newU.rows?.[0] as { name: string; username: string; analysis_limit: number } | undefined;
      const numericId = toNumericId(verif.userId);

      await send(chatId,
        `✅ <b>Telegram muvaffaqiyatli tasdiqlandi!</b>\n\n👤 Ism: <b>${nu?.name ?? "Foydalanuvchi"}</b>\n🆔 <b>Sizning ID raqamingiz:</b> <code>${numericId}</code>\n   <i>(Toʼlov qilganda adminga shu IDni yuboring)</i>\n\n📦 Tarif: Boshlangʼich (Tekin)\n\n🌐 Saytga kiring: sayha-ai.uz\n\nQuyidagi menyu tugmalari orqali platformani boshqaring! 🚀`
      );
      return c.json({ ok: true }, 200);
    }

    // ========================================================================
    // 10. BOT AI LEGAL CHAT — free-text questions & document generation
    // ========================================================================

    // Only process AI questions for verified users (must have a linked account)
    if (user) {
      // ── Check if user can make a query ───────────────────────────────────
      const now = Math.floor(Date.now() / 1000);
      const hasActiveTariff = user.tariff_expires_at && user.tariff_expires_at > now;
      const hasFreeUnlimited = user.free_unlimited_expires_at && user.free_unlimited_expires_at > now;
      const hasLimit = (user.analysis_limit ?? 0) > 0;

      if (!hasActiveTariff && !hasFreeUnlimited && !hasLimit) {
        await send(chatId,
          `⚠️ <b>Tahlil limiti tugadi.</b>\n\nSiz bugungi bepul tahlil imkoniyatlaridan foydalandingiz.\n\n📊 Davom etish uchun tarif sotib oling:`,
          {
            keyboard: [
              [{ text: "📊 Tarif olish" }],
              [{ text: "🚀 Sayha AI-ni ishga tushirish", web_app: { url: WEBAPP } }],
            ],
            resize_keyboard: true,
          }
        );
        return c.json({ ok: true }, 200);
      }

      // ── Detect document generation request ───────────────────────────────
      const { isDocumentRequest, docTitle } = detectDocumentRequest(text);

      // ── Send "thinking" indicator ─────────────────────────────────────────
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });

      try {
        // Build AI prompt (with voice prefix if transcribed)
        const displayMsg = isVoiceMessage
          ? `🎤 [Ovozli xabar transkriptsiyasi]: ${text}`
          : text;

        // If document request → use a DOCX-optimized prompt
        let aiPrompt = displayMsg;
        if (isDocumentRequest) {
          aiPrompt = `${displayMsg}\n\n[TIZIM KO'RSATMASI: Foydalanuvchi yuridik hujjat tayyorlashni so'ramoqda. Iltimos, to'liq, rasmiy va yuridik jihatdan to'g'ri hujjat matnini yozing. Sarlavhalar uchun ## formatidan foydalaning. Barcha bo'limlarni to'liq yozing: tomonlar, shartlar, mas'uliyat va imzo qismi. Hujjat o'zbek tilida bo'lsin.]`;
        }

        // ── RAG context ───────────────────────────────────────────────────
        let ragContext = "";
        try {
          const chunks = await retrieveRelevantChunks(text, 3);
          ragContext = formatRagContext(chunks);
        } catch { /* continue without RAG */ }

        const fullSystem = LEGAL_SYSTEM_PROMPT
          + (ragContext ? `\n\n---\n## RAG Knowledge Base\n${ragContext}\n---\n` : "");

        // ── Generate AI response ──────────────────────────────────────────
        const { text: aiResponse } = await generateText({
          model: gateway("anthropic/claude-sonnet-4.6"),
          system: fullSystem,
          prompt: aiPrompt,
          temperature: 0.3,
          maxTokens: 4000,
        });

        // ── Deduct one analysis credit (unless unlimited) ─────────────────
        if (!hasActiveTariff && !hasFreeUnlimited) {
          await (db as any).$client.execute({
            sql: "UPDATE user SET analysis_limit = MAX(0, analysis_limit - 1) WHERE id = ?",
            args: [user.id],
          });
        }

        // ── If document requested → generate DOCX and send as file ────────
        if (isDocumentRequest) {
          await tg("sendChatAction", { chat_id: chatId, action: "upload_document" });

          try {
            const docBuffer = await generateDocx({
              title: docTitle,
              author: user.name ?? undefined,
              body: aiResponse,
              category: "Sayha AI tomonidan tayyorlangan",
            });

            // Upload via multipart to Telegram sendDocument
            const formData = new FormData();
            formData.append("chat_id", chatId);
            formData.append("caption",
              `📄 <b>${docTitle}</b>\n\nHujjat tayyor! Word formatida yuklab oling va tahrirlang.\n\n<i>Yuridik kuchga ega bo'lishi uchun advokat tasdiqlashi tavsiya etiladi.</i>`
            );
            formData.append("parse_mode", "HTML");
            const safeTitle = docTitle.replace(/\s+/g, "_").replace(/[^\w_]/g, "");
            formData.append(
              "document",
              new Blob([docBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
              `${safeTitle}_SayhaAI.docx`,
            );
            formData.append("reply_markup", JSON.stringify({
              keyboard: [
                [{ text: "🚀 Sayha AI-ni ishga tushirish", web_app: { url: WEBAPP } }],
                [{ text: "📊 Tarif olish" }, { text: "👤 Profil Ma'lumotlari" }],
              ],
              resize_keyboard: true,
            }));

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
              method: "POST",
              body: formData,
              signal: AbortSignal.timeout(30_000),
            });
          } catch (docErr: any) {
            console.error("[DOCX] generation error:", docErr.message);
            // Fall back to sending text response
            const truncated = aiResponse.length > 3500 ? aiResponse.slice(0, 3500) + "\n\n[...]" : aiResponse;
            await send(chatId,
              `📄 <b>${docTitle}</b>\n\n${truncated}\n\n<i>⚠️ .docx fayl yaratishda xatolik yuz berdi. Matn ko'rinishida yuborildi.</i>`
            );
          }

          return c.json({ ok: true }, 200);
        }

        // ── Normal text response ──────────────────────────────────────────
        // Telegram max message length is 4096 chars
        const responseText = aiResponse.length > 4000
          ? aiResponse.slice(0, 4000) + "\n\n[Javob qisqartirildi]"
          : aiResponse;

        await send(chatId, responseText);

        // ── TTS: send voice response if original was a voice message ──────
        if (isVoiceMessage && process.env.ELEVENLABS_API_KEY) {
          try {
            await tg("sendChatAction", { chat_id: chatId, action: "record_voice" });

            // For TTS, strip markdown and limit text
            const ttsText = aiResponse
              .replace(/\*\*/g, "")
              .replace(/#+\s/g, "")
              .replace(/\n{3,}/g, "\n\n")
              .slice(0, 3000);

            const audioBuffer = await textToSpeech(ttsText);

            const voiceForm = new FormData();
            voiceForm.append("chat_id", chatId);
            voiceForm.append(
              "voice",
              new Blob([audioBuffer], { type: "audio/mpeg" }),
              "response.mp3",
            );
            voiceForm.append("caption", "🔊 Ovozli javob");

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
              method: "POST",
              body: voiceForm,
              signal: AbortSignal.timeout(60_000),
            });
          } catch (ttsErr: any) {
            console.warn("[TTS] ElevenLabs error:", ttsErr.message);
            // TTS is best-effort; text was already sent above
          }
        }

        return c.json({ ok: true }, 200);

      } catch (aiErr: any) {
        console.error("[BOT AI] chat error:", aiErr.message);
        await send(chatId,
          "❌ <b>AI xizmatida xatolik yuz berdi.</b>\n\nIltimos, qayta urinib ko'ring yoki <a href=\"https://sayha-ai.uz/dashboard\">veb sayt</a> orqali murojaat qiling."
        );
        return c.json({ ok: true }, 200);
      }
    }

    // Fallback (unlinked user)
    await send(chatId, "⚖️ <b>Sayha AI</b>\n\nQuyidagi menyu tugmalaridan birini tanlang.");
    return c.json({ ok: true }, 200);
  });


export type AppType = typeof app;
export default app;

// ─── Warm Google Drive cache on startup (non-blocking) ───────────────────────
setTimeout(() => {
  getDriveChunks()
    .then((c) => console.log(`[GDrive] Startup cache: ${c.length} files loaded`))
    .catch((e) => console.warn("[GDrive] Startup cache failed:", e.message));
}, 2000);
