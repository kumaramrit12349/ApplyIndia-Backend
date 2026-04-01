import { ScrapedNotification } from "./types";

/**
 * Attempts to parse a date string in various Indian government formats
 * into a YYYY-MM-DD string suitable for toEpoch().
 *
 * Handles:
 *   DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
 *   YYYY-MM-DD (passthrough)
 *   "30 April 2025", "30 Apr 2025"
 *   "Last Date: 30-04-2025" (strips prefix)
 */
export function parseIndianDate(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;

  // Strip common prefixes
  const cleaned = raw
    .replace(/[Ll]ast\s*[Dd]ate\s*[:\-]?\s*/g, "")
    .replace(/[Ss]tart\s*[Dd]ate\s*[:\-]?\s*/g, "")
    .replace(/[Ee]xam\s*[Dd]ate\s*[:\-]?\s*/g, "")
    .replace(/[Aa]pply\s*[Tt]ill\s*[:\-]?\s*/g, "")
    .trim();

  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmy = cleaned.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // "30 April 2025" or "30 Apr 2025"
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12",
    january: "01", february: "02", march: "03", april: "04",
    june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const longDate = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (longDate) {
    const [, d, mon, y] = longDate;
    const m = monthNames[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }

  return undefined;
}

/**
 * Returns true if the given YYYY-MM-DD date string is older than `maxDaysBack` days ago.
 * Items with no recognised date are NOT considered old (we give them the benefit of the doubt).
 *
 * @param dateStr   - A YYYY-MM-DD string (as returned by parseIndianDate)
 * @param maxDaysBack - Maximum number of calendar days in the past to allow (default: 2)
 */
export function isDateTooOld(dateStr: string | undefined, maxDaysBack = 2): boolean {
  if (!dateStr) return false; // No date → don't filter out

  const itemDate = new Date(dateStr);
  if (isNaN(itemDate.getTime())) return false; // Unparseable → don't filter out

  // Midnight local time today, then subtract maxDaysBack full days
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - maxDaysBack);

  return itemDate < cutoff;
}

/**
 * Infer notification category from title text.
 * Returns one of the NOTIFICATION_CATEGORIES values.
 */
export function inferCategory(title: string, ctxCategory: string): string {
  const t = title.toLowerCase();

  // Bucket 1: Results
  if (/result|cutoff|cut-off|score\s*card|merit\s*list/.test(t)) return "result";
  
  // Bucket 2: Admit Cards
  if (/admit\s*card|hall\s*ticket|exam\s*city/.test(t)) return "admit-card";
  
  // Bucket 3: Answer Keys
  if (/answer\s*key/.test(t)) return "answer-key";
  
  // Bucket 4: Documents (Manual updates like Syllabus, Calendar)
  if (/syllabus|exam\s*pattern|calendar|otr|registration|certificate|voter|dakhil|land\s*record|credential\s*verification/.test(t)) {
    if (/syllabus/.test(t)) return "syllabus";
    return "documents";
  }

  // Bucket 5: Admission
  if (/admission|entrance|neet|jee|ctet|cuet|cat|mat|xat|gate|bed|polytechnic|iti/.test(t)) return "admission";

  // Bucket 6: Latest Jobs (The default)
  if (/notification|recruitment|vacancy|apply|advt|employment|online\s*form/.test(t)) return "latest-jobs";

  return ctxCategory || "latest-jobs";
}

/**
 * Infer the state from the title / department string.
 * Returns lowercase state value matching INDIAN_STATES options,
 * or "central" for central government, or "all-india".
 */
export function inferState(title: string, defaultState: string): string {
  if (defaultState && defaultState !== "all-india") return defaultState;

  const t = title.toLowerCase();

  const stateMap: [RegExp, string][] = [
    [/uttar\s*pradesh|up\s*govt|lakhnou|lucknow/, "uttar-pradesh"],
    [/bihar/, "bihar"],
    [/rajasthan/, "rajasthan"],
    [/madhya\s*pradesh|mppsc|mp\s*govt/, "madhya-pradesh"],
    [/maharashtra|mpsc/, "maharashtra"],
    [/gujarat/, "gujarat"],
    [/west\s*bengal|wbpsc/, "west-bengal"],
    [/karnataka|kpsc/, "karnataka"],
    [/andhra\s*pradesh|appsc/, "andhra-pradesh"],
    [/telangana|tspsc/, "telangana"],
    [/tamil\s*nadu|tnpsc/, "tamil-nadu"],
    [/kerala|kpsc/, "kerala"],
    [/punjab/, "punjab"],
    [/haryana/, "haryana"],
    [/himachal|hppsc/, "himachal-pradesh"],
    [/uttarakhand|ukpsc/, "uttarakhand"],
    [/jharkhand|jpsc/, "jharkhand"],
    [/chhattisgarh|cgpsc/, "chhattisgarh"],
    [/odisha|opsc/, "odisha"],
    [/assam|apsc/, "assam"],
    [/delhi/, "delhi"],
    [/goa/, "goa"],
    [/ssc|upsc|rrb|ibps|rbi|nta|central|india|national|all\s*india/, "central"],
  ];

  for (const [pattern, state] of stateMap) {
    if (pattern.test(t)) return state;
  }

  return defaultState || "central";
}

/**
 * Determine status flags from notification title.
 */
export function inferStatusFlags(title: string): {
  has_admit_card: boolean;
  has_result: boolean;
  has_answer_key: boolean;
  has_syllabus: boolean;
} {
  const t = title.toLowerCase();
  return {
    has_admit_card: /admit\s*card/.test(t),
    has_result: /result/.test(t),
    has_answer_key: /answer\s*key/.test(t),
    has_syllabus: /syllabus/.test(t),
  };
}

/**
 * Extract vacancy count from text like "2000 Posts", "1500 Vacancies"
 */
export function extractVacancyCount(text: string): number {
  const match = text.match(/(\d[\d,]*)\s*(post|vacancy|vacancies|seat|opening)/i);
  if (match) {
    return parseInt(match[1].replace(/,/g, ""), 10);
  }
  return 0;
}

/**
 * Build a default ScrapedNotification skeleton.
 * Callers should override the fields they know about.
 */
export function buildDefaultNotification(
  title: string,
  sourceUrl: string,
  scrapedFrom: string,
  defaultCategory: string,
  defaultState: string,
  rawDate?: string,
): ScrapedNotification {
  const today = new Date().toISOString().slice(0, 10);
  const defaultLastDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const parsedDate = parseIndianDate(rawDate);
  const category = inferCategory(title, defaultCategory);
  const state = inferState(title, defaultState);
  const flags = inferStatusFlags(title);

  return {
    title,
    category,
    state,
    department: "Government of India",
    start_date: parsedDate || today,
    last_date_to_apply: parsedDate || defaultLastDate,
    total_vacancies: 0,
    ...flags,
    details: {
      short_description: `<p>${title}</p>`,
      long_description: `<p>For complete details, visit the official notification page: <a href="${sourceUrl}" target="_blank">${sourceUrl}</a></p>`,
      important_date_details: parsedDate ? `<p>Last Date: ${parsedDate}</p>` : "",
    },
    fee: {
      general_fee: 0,
      obc_fee: 0,
      sc_fee: 0,
      st_fee: 0,
      ph_fee: 0,
    },
    eligibility: {
      min_age: 0,
      max_age: 0,
      qualification: "As per official notification",
      specialization: "",
      min_percentage: 0,
    },
    links: {
      apply_online_url: sourceUrl,
      official_website_url: new URL(sourceUrl).origin,
    },
    source_url: sourceUrl,
    scraped_from: scrapedFrom,
    created_by: `Scraper Bot — ${scrapedFrom}`,
  };
}

/**
 * Determine if a title likely represents a primary notification
 * vs a supportive document (FAQ, Manual, Fee Structure).
 */
export function isNotificationTitle(title: string): boolean {
  const t = title.toLowerCase();
  
  // Explicitly ignore common generic support keywords (keep these as NOISE)
  const noiseKeywords = [
    "faq", "manual", "instruction", "guideline", "procedure", 
    "how to apply", "frequently asked", "review", "curriculum", 
    "technical issue", "registration help", "user manual",
    "payment process", "fee structure", "test fee", "international fee"
  ];

  if (noiseKeywords.some(k => t.includes(k))) return false;

  // Must have some "bucket" or "entity" keywords to be captured
  const primaryKeywords = [
     "notification", "recruitment", "vacancy", "admission", "entrance", "exam",
     "apply", "registration", "result", "admit card", "hall ticket", "score card",
     "merit list", "syllabus", "schedule", "calendar", "answer key", "cutoff",
     "advt", "employment", "online form", "dakhil kharij", "land record", "ceritificate"
  ];

  return primaryKeywords.some(k => t.includes(k));
}
