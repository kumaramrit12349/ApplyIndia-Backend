import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";
import { ScrapedRawItem, ScraperSiteConfig } from "../types";

const POSITIVE_KEYWORDS = [
  "admit card", "result", "apply online", "registration", "syllabus", 
  "vacancy", "recruitment", "notification", "answer key", "score card",
  "exam date", "schedule", "merit list", "online application", "call letter"
];

const NEGATIVE_KEYWORDS = [
  "tender", "rti", "contact", "about us", "gallery", "disclaimer", "privacy",
  "map", "login", "register", "forgot password", "archive", "media", "act",
  "rules", "download forms", "faq", "fees", "fee structure", "manual", 
  "instruction", "guideline", "procedure", "how to apply", "frequently asked", 
  "review", "curriculum", "payment", "bank", "challan", "round", 
  "seat allotment", "choice filling", "reschedule", "re-schedule", 
  "reopening", "re-open", "extending", "extension", "window", 
  "press release", "public notice", "mop-up", "stray vacancy"
];

const IGNORE_EXTENSIONS = [".jpg", ".png", ".jpeg", ".gif", ".csv", ".zip"];

function getScore(text: string, href: string): number {
  let score = 0;
  const lowerText = text.toLowerCase();
  const lowerHref = href.toLowerCase();

  // Basic sanity check: Must have enough descriptive text
  if (lowerText.length < 15) return -10; // "click here", "read more" -> fail
  if (lowerText.length > 250) return -10; // Too long, probably a full paragraph

  // PDF links are highly likely to be valid notifications on govt sites
  if (lowerHref.endsWith(".pdf")) score += 2;
  
  // Ignore random images or archives
  if (IGNORE_EXTENSIONS.some(ext => lowerHref.endsWith(ext))) return -10;

  // Positive Keyword grading
  for (const keyword of POSITIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) score += 2;
    if (lowerHref.includes(keyword.replace(" ", "-"))) score += 1;
  }

  // Negative Keyword grading
  // Increase penalty to ensure items like "FAQ" or "Fees" fail the score > 0 check
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) score -= 5;
    if (lowerHref.includes(keyword.replace(" ", "-"))) score -= 3;
  }

  // Look for dates embedded in the text (e.g. DD/MM/YYYY or DD-Mon-YYYY)
  const hasDateString = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(lowerText) || 
                        /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{2,4}\b/i.test(lowerText);
  if (hasDateString) score += 2;

  return score;
}

function makeAbsoluteUrl(base: string, relative: string): string {
  if (!relative) return "";
  if (relative.startsWith("http")) return relative;
  
  try {
    const url = new URL(relative, base);
    return url.toString();
  } catch (e) {
    return base.replace(/\/+$/, "") + "/" + relative.replace(/^\/+/, "");
  }
}

export async function scrapeGeneric(config: ScraperSiteConfig): Promise<ScrapedRawItem[]> {
  const items: ScrapedRawItem[] = [];
  
  try {
    if (!config.listingUrl || !config.listingUrl.startsWith("http")) {
      console.error(`[Scraper - Generic] Invalid URL for ${config.key}: ${config.listingUrl}`);
      return [];
    }

    const baseUrl = new URL(config.listingUrl);
    const response = await axios.get(config.listingUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        "Referer": baseUrl.origin,
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Upgrade-Insecure-Requests": "1"
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 20000,
      validateStatus: () => true 
    });

    if (response.status >= 400) {
      console.error(`[Scraper - Generic] Failed to fetch ${config.key}. Status: ${response.status} at ${config.listingUrl}`);
      return [];
    }

    const $ = cheerio.load(response.data);

    // Strip out noise directly
    $("header, footer, nav, script, style, aside, .sidebar, .menu").remove();
    const seenUrls = new Set<string>();

    $("a[href]").each((_, el) => {
      const hrefAttr = $(el).attr("href")?.trim();
      let rawTitle = $(el).text().trim().replace(/[\n\t\r]+/g, " ");

      if (!hrefAttr) return;

      const absoluteUrl = makeAbsoluteUrl(config.listingUrl, hrefAttr);
      if (seenUrls.has(absoluteUrl)) return;

      // Pull the closest logical container to look for both a richer title and a date
      const container = $(el).closest("tr, li, div, p, td, h1, h2, h3, h4, h5");
      const containerText = container.text().trim().replace(/[\n\t\r]+/g, " ");

      // CONTEXTUAL AWARENESS: 
      // If the link text is too short (e.g. "Click Here", "PDF"), 
      // we check the context of the container (card, table row, list item).
      if (rawTitle.length < 15) {
        if (containerText.length > 15 && containerText.length < 500) {
          rawTitle = containerText;
        }
      }

      // Updated sanity: lowered from 15 to 6 to handle "Exams", "GATE", etc.
      if (rawTitle.length < 6) return;
      if (rawTitle.length > 500) return; 

      const score = getScore(rawTitle, absoluteUrl);
      
      // Must score > 0 to be considered a viable notification
      if (score > 0) {
        seenUrls.add(absoluteUrl);
        // Clean common interactive prefixes
        const finalTitle = rawTitle
          .replace(/^(Click Here|Read More|PDF|Download|View|More Details|Link)[:\s-]*/i, "")
          .trim() || rawTitle;

        // --- Date extraction from container context ---
        // Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        const datePatternDMY = /\b(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})\b/;
        // Pattern 2: DD Mon/Month YYYY  e.g. "29 March 2025" or "29 Mar 2025"
        const datePatternLong = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s,]*(\d{4})\b/i;

        let rawDateText: string | undefined;
        const dmyMatch = containerText.match(datePatternDMY);
        if (dmyMatch) {
          rawDateText = dmyMatch[0];
        } else {
          const longMatch = containerText.match(datePatternLong);
          if (longMatch) rawDateText = longMatch[0];
        }

        items.push({
          siteKey: config.key,
          rawTitle: finalTitle,
          href: absoluteUrl,
          rawDateText,
        });
      }
    });

  } catch (err: any) {
    console.error(`[Scraper - Generic] Error crawling ${config.key}: ${err.message}`);
  }

  return items;
}
