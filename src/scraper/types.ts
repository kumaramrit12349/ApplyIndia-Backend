/**
 * Raw data extracted from a scraped listing page before normalization.
 * Each site-specific parser produces a list of these.
 */
export interface ScrapedRawItem {
  /** The canonical link to the individual notification page */
  href: string;
  /** Title text exactly as scraped */
  rawTitle: string;
  /** Any date text found on the listing row, e.g. "12-03-2025" or "Last Date: 30/04/2025" */
  rawDateText?: string;
  /** Any short description or tagline scraped alongside the title */
  rawDescription?: string;
  /** Source site identifier, e.g. "sarkariresult" */
  siteKey: string;
}

/**
 * A normalized notification ready to be fed into addCompleteNotification().
 * All optional fields from the schema are kept optional so scrapers don't need to
 * know every field — the service fills in defaults.
 */
export interface ScrapedNotification {
  title: string;
  category: string;
  state: string;
  department: string;

  start_date: string;        // YYYY-MM-DD
  last_date_to_apply: string; // YYYY-MM-DD
  exam_date?: string;

  total_vacancies: number;

  has_admit_card: boolean;
  has_result: boolean;
  has_answer_key: boolean;
  has_syllabus: boolean;

  details: {
    short_description: string;
    long_description: string;
    important_date_details?: string;
  };

  fee: {
    general_fee: number;
    obc_fee: number;
    sc_fee: number;
    st_fee: number;
    ph_fee: number;
    other_fee_details?: string;
  };

  eligibility: {
    min_age: number;
    max_age: number;
    qualification: string;
    specialization: string;
    min_percentage: number;
    age_relaxation_details?: string;
  };

  links: {
    official_website_url?: string;
    notification_pdf_url?: string;
    apply_online_url?: string;
    admit_card_url?: string;
    answer_key_url?: string;
    result_url?: string;
    youtube_link?: string;
    other_links?: string;
  };

  source_url: string;   // The scraped page URL — used for deduplication
  scraped_from: string; // Human-readable source site name
  created_by: string;   // "Scraper Bot — <siteName>"
}

/**
 * Configuration for a single scraper site/section.
 * These can be hardcoded or eventually stored in DynamoDB.
 */
export interface ScraperSiteConfig {
  /** Unique key, e.g. "sarkariresult-jobs" */
  key: string;
  /** Human-readable display name */
  name: string;
  /** URL of the listing page to scrape */
  listingUrl: string;
  /** Default notification category for this source */
  defaultCategory: string;
  /** Default state, e.g. "central" or "All India" */
  defaultState: string;
  /** Whether this source is currently active */
  isActive: boolean;
}

/**
 * Summary of a single scraper run — returned by the orchestrator.
 */
export interface ScraperRunSummary {
  startedAt: number;
  completedAt: number;
  totalSitesProcessed: number;
  totalFound: number;
  totalInserted: number;
  totalSkipped: number; // duplicates
  totalVirtual: number; // results/admit-cards/etc.
  totalDateFiltered: number; // items older than 2 days
  totalFailed: number;
  errors: string[];
  dryRunItems?: {
    title: string;
    href: string;
    siteName: string;
    category?: string;
    state?: string;
  }[];
  perSite: {
    siteKey: string;
    found: number;
    inserted: number;
    skipped: number;
    virtual: number;
    dateFiltered: number;
    failed: number;
  }[];
}
