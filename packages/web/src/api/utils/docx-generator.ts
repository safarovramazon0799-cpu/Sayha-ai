/**
 * DOCX generation utility for Sayha AI.
 *
 * Converts structured legal text (Markdown-like headings + paragraphs) into
 * a well-formatted Microsoft Word document (.docx).
 *
 * Uses the `docx` npm package (pure JS, no native deps).
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DocxOptions {
  title: string;
  /** Full name of the author / requestor (optional) */
  author?: string;
  /** ISO date string or display date */
  date?: string;
  /** The AI-generated legal body text (plain text or simple Markdown) */
  body: string;
  /** Document category for header */
  category?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBodyToParagraphs(body: string): Paragraph[] {
  const lines = body.split(/\r?\n/);
  const result: Paragraph[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      result.push(new Paragraph({ text: "" }));
      continue;
    }

    // ## Heading 2
    if (line.startsWith("## ")) {
      result.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.slice(3), bold: true, size: 28 })],
          spacing: { before: 200, after: 80 },
        }),
      );
      continue;
    }

    // # Heading 1
    if (line.startsWith("# ")) {
      result.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: line.slice(2), bold: true, size: 32 })],
          spacing: { before: 240, after: 120 },
        }),
      );
      continue;
    }

    // ### Heading 3
    if (line.startsWith("### ")) {
      result.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: line.slice(4), bold: true, size: 24 })],
          spacing: { before: 160, after: 60 },
        }),
      );
      continue;
    }

    // Bullet points (- or *)
    if (/^[-*•]\s/.test(line)) {
      result.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: line.replace(/^[-*•]\s+/, "") })],
          spacing: { before: 60, after: 60 },
        }),
      );
      continue;
    }

    // Numbered list (1. 2. etc)
    if (/^\d+\.\s/.test(line)) {
      result.push(
        new Paragraph({
          numbering: { reference: "numbered-list", level: 0 },
          children: [new TextRun({ text: line.replace(/^\d+\.\s+/, "") })],
          spacing: { before: 60, after: 60 },
        }),
      );
      continue;
    }

    // Bold inline **text**  
    const boldParts = line.split(/(\*\*[^*]+\*\*)/);
    const runs: TextRun[] = boldParts.map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return new TextRun({ text: part.slice(2, -2), bold: true });
      }
      return new TextRun({ text: part });
    });

    result.push(
      new Paragraph({
        children: runs,
        spacing: { before: 80, after: 80 },
      }),
    );
  }

  return result;
}

// ─── Main generator ──────────────────────────────────────────────────────────

export async function generateDocx(opts: DocxOptions): Promise<Buffer> {
  const { title, author, date, body, category } = opts;

  const displayDate =
    date ?? new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" });

  const bodyParagraphs = parseBodyToParagraphs(body);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbered-list",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24 }, // 12pt
          paragraph: { spacing: { line: 320 } },      // 1.5 line spacing
        },
      },
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Times New Roman", size: 24 },
          paragraph: { spacing: { line: 320 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 850, bottom: 1134, left: 1134 }, // ~2cm margins
          },
        },
        children: [
          // ── Document title ────────────────────────────────────────────────
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240 },
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 32,
                font: "Times New Roman",
              }),
            ],
          }),

          // ── Category & date ───────────────────────────────────────────────
          ...(category
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 80 },
                  children: [new TextRun({ text: category, italics: true, size: 22 })],
                }),
              ]
            : []),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 80, after: 80 },
            children: [new TextRun({ text: `Sana: ${displayDate}`, size: 22 })],
          }),

          ...(author
            ? [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 0, after: 240 },
                  children: [new TextRun({ text: `Muallif: ${author}`, size: 22 })],
                }),
              ]
            : [new Paragraph({ text: "", spacing: { before: 0, after: 240 } })]),

          // ── Divider ───────────────────────────────────────────────────────
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "2C3E50" },
            },
            spacing: { before: 0, after: 240 },
            text: "",
          }),

          // ── Body content ──────────────────────────────────────────────────
          ...bodyParagraphs,

          // ── Footer note ───────────────────────────────────────────────────
          new Paragraph({
            border: {
              top: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "BDC3C7" },
            },
            spacing: { before: 480, after: 80 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Ushbu hujjat Sayha AI (sayha-ai.uz) tomonidan avtomatik tarzda yaratilgan. ",
                italics: true,
                size: 18,
                color: "7F8C8D",
              }),
              new TextRun({
                text: "Yuridik kuchga ega bo'lishi uchun malakali advokat tomonidan tasdiqlanishi tavsiya etiladi.",
                italics: true,
                size: 18,
                color: "7F8C8D",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── Document type detector ───────────────────────────────────────────────────

const DOC_KEYWORDS_UZ = [
  "davo ariza",
  "davo arizasini",
  "shartnoma tuz",
  "shartnoma yoz",
  "ariza yoz",
  "hujjat yoz",
  "hujjat tuz",
  "da'vo ariza",
  "da'vonom",
  "ishga olish buyrug'i",
  "buyruq yoz",
  "vasiyatnoma",
  "tilxat",
  "ishonchnoma",
  "nikoh shartnoma",
  "ijara shartnoma",
  "qarz shartnoma",
  "mehnat shartnoma",
  "xizmat shartnoma",
  "xat yoz",
  "rasmiy xat",
];

const DOC_KEYWORDS_RU = [
  "составь договор",
  "напиши исковое",
  "исковое заявление",
  "трудовой договор",
  "договор аренды",
  "напиши заявление",
  "составить документ",
  "доверенность",
];

export function detectDocumentRequest(message: string): {
  isDocumentRequest: boolean;
  docTitle: string;
} {
  const lower = message.toLowerCase();

  for (const kw of DOC_KEYWORDS_UZ) {
    if (lower.includes(kw)) {
      return { isDocumentRequest: true, docTitle: guessTitle(lower, kw) };
    }
  }
  for (const kw of DOC_KEYWORDS_RU) {
    if (lower.includes(kw)) {
      return { isDocumentRequest: true, docTitle: guessTitleRu(lower, kw) };
    }
  }

  return { isDocumentRequest: false, docTitle: "" };
}

function guessTitle(msg: string, keyword: string): string {
  if (msg.includes("davo ariza") || msg.includes("da'vo ariza")) return "Davo Arizasi";
  if (msg.includes("mehnat shartnoma")) return "Mehnat Shartnomasi";
  if (msg.includes("ijara shartnoma")) return "Ijara Shartnomasi";
  if (msg.includes("qarz shartnoma")) return "Qarz Shartnomasi";
  if (msg.includes("nikoh shartnoma")) return "Nikoh Shartnomasi";
  if (msg.includes("xizmat shartnoma")) return "Xizmat Ko'rsatish Shartnomasi";
  if (msg.includes("ishonchnoma")) return "Ishonchnoma";
  if (msg.includes("vasiyatnoma")) return "Vasiyatnoma";
  if (msg.includes("shartnoma")) return "Shartnoma";
  if (msg.includes("ariza")) return "Ariza";
  if (msg.includes("buyruq")) return "Buyruq";
  if (msg.includes("tilxat")) return "Tilxat";
  return "Yuridik Hujjat";
}

function guessTitleRu(msg: string, keyword: string): string {
  if (msg.includes("исковое")) return "Исковое заявление";
  if (msg.includes("трудовой договор")) return "Трудовой договор";
  if (msg.includes("договор аренды")) return "Договор аренды";
  if (msg.includes("доверенность")) return "Доверенность";
  if (msg.includes("договор")) return "Договор";
  if (msg.includes("заявление")) return "Заявление";
  return "Юридический документ";
}
