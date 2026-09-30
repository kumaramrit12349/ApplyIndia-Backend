/**
 * Zero-cost, convention-based question extractor for Mock Test authoring.
 * No LLM/external API involved — this only works because the admin commits
 * to one fixed text layout (see the "Format Rules" shipped with the sample
 * PDF): `Q<n>.` starts a question, `[HI]` lines are the Hindi translation of
 * the line directly above them, `(A)`-`(D)` are options, `[ANSWER: X]` closes
 * a question, an optional `[EXPLANATION: ...]` line (with its own optional
 * `[HI]` follow-up) can come right after the answer, and `[SECTION: Name]`
 * applies to every question after it.
 *
 * This is intentionally a best-effort extraction — the caller must always
 * route the result through an admin review/edit step before anything is
 * saved as a real question, since a silent misparse of a correct answer in
 * live exam content is a real accuracy risk.
 */

export interface IParsedMockTestQuestion {
  section: string;
  question_en: string;
  question_hi?: string;
  options_en: [string, string, string, string];
  options_hi?: [string, string, string, string];
  correct_option_index: 0 | 1 | 2 | 3;
  explanation_en?: string;
  explanation_hi?: string;
  /** Set when something about this block couldn't be parsed cleanly — surfaced to the admin for review, never silently dropped. */
  warning?: string;
}

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
const QUESTION_LINE = /^Q(\d+)\.\s*(.*)$/i;
const HI_LINE = /^\[HI\]\s*(.*)$/i;
const OPTION_LINE = /^\(([A-D])\)\s*(.*)$/i;
const ANSWER_LINE = /^\[ANSWER:\s*([A-D])\]$/i;
const SECTION_LINE = /^\[SECTION:\s*(.*)\]$/i;
const EXPLANATION_LINE = /^\[EXPLANATION:\s*(.*)\]$/i;

export async function extractTextFromDocument(buffer: Buffer, mimetype: string): Promise<string> {
  if (mimetype === "application/pdf") {
    // pdf-parse v2's API is a class, not the old v1 `pdf(buffer)` function —
    // { data: buffer } takes ownership of parsing in-memory, no temp files.
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      // pdf-parse inserts a "-- N of M --" page-boundary marker between
      // pages, sometimes glued directly onto the last line of a page with no
      // separating newline — strip it as a substring (not just a whole-line
      // match) so it can't get silently absorbed into a question/option.
      return result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "");
    } finally {
      await parser.destroy();
    }
  }
  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimetype === "application/msword"
  ) {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error("UNSUPPORTED_FILE_TYPE");
}

export function parseMockTestQuestions(rawText: string): IParsedMockTestQuestion[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: IParsedMockTestQuestion[] = [];
  let currentSection = "General";
  let current: Partial<IParsedMockTestQuestion> & { optionsEn: string[]; optionsHi: string[] } | null = null;
  /** Tracks which line a `[HI]` line is translating — "question", "explanation", or an option index (0-3). */
  let lastLineKind: "question" | "explanation" | number | null = null;

  const flush = () => {
    if (!current) return;
    const missing = OPTION_LETTERS.filter((_, i) => !current!.optionsEn[i]);
    if (!current.question_en || missing.length > 0 || current.correct_option_index === undefined) {
      current.warning = `Incomplete question block near "${(current.question_en || "").slice(0, 40)}" — missing ${
        !current.question_en ? "question text" : missing.length > 0 ? `option(s) ${missing.join(",")}` : "answer marker"
      }.`;
    }
    questions.push({
      section: current.section || currentSection,
      question_en: current.question_en || "",
      question_hi: current.question_hi,
      options_en: [current.optionsEn[0] || "", current.optionsEn[1] || "", current.optionsEn[2] || "", current.optionsEn[3] || ""],
      options_hi: current.optionsHi.some(Boolean)
        ? [current.optionsHi[0] || "", current.optionsHi[1] || "", current.optionsHi[2] || "", current.optionsHi[3] || ""]
        : undefined,
      correct_option_index: current.correct_option_index ?? 0,
      explanation_en: current.explanation_en,
      explanation_hi: current.explanation_hi,
      warning: current.warning,
    });
    current = null;
    lastLineKind = null;
  };

  for (const line of lines) {
    const sectionMatch = line.match(SECTION_LINE);
    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const qMatch = line.match(QUESTION_LINE);
    if (qMatch) {
      flush();
      current = { section: currentSection, question_en: qMatch[2].trim(), optionsEn: [], optionsHi: [] };
      lastLineKind = "question";
      continue;
    }

    if (!current) continue; // stray text before the first Q1. — ignore

    const hiMatch = line.match(HI_LINE);
    if (hiMatch) {
      const text = hiMatch[1].trim();
      if (lastLineKind === "question") current.question_hi = text;
      else if (lastLineKind === "explanation") current.explanation_hi = text;
      else if (typeof lastLineKind === "number") current.optionsHi[lastLineKind] = text;
      continue;
    }

    const optMatch = line.match(OPTION_LINE);
    if (optMatch) {
      const idx = OPTION_LETTERS.indexOf(optMatch[1].toUpperCase() as any);
      current.optionsEn[idx] = optMatch[2].trim();
      lastLineKind = idx;
      continue;
    }

    const ansMatch = line.match(ANSWER_LINE);
    if (ansMatch) {
      current.correct_option_index = OPTION_LETTERS.indexOf(ansMatch[1].toUpperCase() as any) as 0 | 1 | 2 | 3;
      lastLineKind = null;
      continue;
    }

    const explMatch = line.match(EXPLANATION_LINE);
    if (explMatch) {
      current.explanation_en = explMatch[1].trim();
      lastLineKind = "explanation";
      continue;
    }

    // A line that matches none of the markers — most likely a question/option
    // that wrapped onto a second line in the source doc. Append it to
    // whatever the previous line was, rather than silently dropping it.
    if (lastLineKind === "question") current.question_en += " " + line;
    else if (lastLineKind === "explanation") current.explanation_en = (current.explanation_en || "") + " " + line;
    else if (typeof lastLineKind === "number") current.optionsEn[lastLineKind] += " " + line;
  }
  flush();

  return questions;
}
