import { ScrapedNotification, ScraperRunSummary, ScraperSiteConfig } from "./types";
import { buildDefaultNotification, inferCategory, inferState, inferStatusFlags, isNotificationTitle, isDateTooOld, parseIndianDate } from "./normalizer";
import { initializeDeduplicatorCache, isDuplicate, addDuplicationRecord } from "./deduplicator";
import { addCompleteNotification } from "../services/private/notificationService";



import { scrapeGeneric } from "./sites/genericParser";
import { getAllScraperConfigs } from "../services/private/scraperConfigService";
import { IScraperConfig } from "../db_schema/ScraperConfig/ScraperConfigInterface";

/**
 * Map dynamic DB configs to actual executable parser codes.
 */
export function getScraperEngine(key: string): (config: ScraperSiteConfig) => Promise<any[]> {
  return scrapeGeneric;
}

/**
 * Main orchestration function.
 * Fetches from all active sites, normalizes, deduplicates, then inserts.
 *
 * @param dryRun - if true, skip the DynamoDB insert (useful for testing)
 */
export async function runScraper(dryRun = false): Promise<ScraperRunSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];

  const summary: ScraperRunSummary = {
    startedAt,
    completedAt: 0,
    totalSitesProcessed: 0,
    totalFound: 0,
    totalInserted: 0,
    totalSkipped: 0,
    totalVirtual: 0,
    totalFailed: 0,
    totalDateFiltered: 0,
    errors,
    perSite: [],
  };

  // Fetch ALL dynamic definitions that are active from DynamoDB
  const dbConfigs: IScraperConfig[] = await getAllScraperConfigs(false); // only active

  // Step 0: Bootstrap the Deduplicator RAM Cache
  await initializeDeduplicatorCache();

  const activeSites = dbConfigs.map((c) => ({
    config: {
      key: c.key,
      name: c.name,
      listingUrl: c.listingUrl,
      defaultCategory: c.defaultCategory || "latest-jobs",
      defaultState: c.defaultState || "all-india",
      isActive: c.isActive,
    } as ScraperSiteConfig,
    scraper: getScraperEngine(c.key),
  }));

  if (activeSites.length === 0) {
    console.log("[Scraper] No active sites configured in DynamoDB.");
  }

  const CONCURRENCY_LIMIT = 5;
  const results: ScraperRunSummary[] = [];

  // Process sites in batches of 5 to avoid resource exhaustion in Lambda
  for (let i = 0; i < activeSites.length; i += CONCURRENCY_LIMIT) {
    const batch = activeSites.slice(i, i + CONCURRENCY_LIMIT);
    
    await Promise.all(batch.map(async ({ config, scraper }) => {
      const siteSummary = {
        siteKey: config.key,
        found: 0,
        inserted: 0,
        skipped: 0,
        virtual: 0,
        failed: 0,
        dateFiltered: 0,
      };

      try {
        console.log(`[Scraper] Starting ${config.name} (${config.listingUrl})`);
        const rawItems = await scraper(config);
        siteSummary.found = rawItems.length;
        summary.totalFound += rawItems.length;

        console.log(`[Scraper] ${config.name}: found ${rawItems.length} items`);

        for (const raw of rawItems) {
          try {
            // Skip if we already have this URL or Title (Actual Duplicates)
            const duplicate = await isDuplicate(raw.href, raw.rawTitle);
            if (duplicate) {
              siteSummary.skipped++;
              summary.totalSkipped++;
              continue;
            }

            // Skip if the scraped date is more than 2 days in the past
            const parsedRawDate = parseIndianDate(raw.rawDateText);
            if (isDateTooOld(parsedRawDate, 2)) {
              siteSummary.dateFiltered++;
              summary.totalDateFiltered++;
              continue;
            }

            // Skip if obviously not a primary notification (FAQs, Manuals, etc.)
            if (!isNotificationTitle(raw.rawTitle)) {
              continue;
            }

            // Normalize raw item into a ScrapedNotification
            const notification: ScrapedNotification = buildDefaultNotification(
              raw.rawTitle,
              raw.href,
              config.name,
              config.defaultCategory,
              config.defaultState,
              raw.rawDateText,
            );

            // Virtual Categories
            const isVirtual = ["result", "admit-card", "answer-key", "syllabus", "documents"].includes(notification.category);

            if (!isVirtual && !dryRun) {
              await addCompleteNotification(notification as any);
              addDuplicationRecord(raw.href, raw.rawTitle);
              siteSummary.inserted++;
              summary.totalInserted++;
            } else {
              // Collect for Preview
              if (!summary.dryRunItems) summary.dryRunItems = [];
              if (summary.dryRunItems.length < 100) {
                summary.dryRunItems.push({
                  title: notification.title,
                  href: raw.href,
                  siteName: config.name,
                  category: notification.category,
                  state: notification.state
                });
                addDuplicationRecord(raw.href, raw.rawTitle);
              }
              if (isVirtual) {
                siteSummary.virtual++; 
                summary.totalVirtual++;
              }
            }
          } catch (itemError: any) {
            siteSummary.failed++;
            summary.totalFailed++;
            const msg = `[${config.name}] Item error: ${itemError?.message || itemError}`;
            errors.push(msg);
          }
        }
      } catch (siteError: any) {
        const msg = `[${config.name}] Site scrape failed: ${siteError?.message || siteError}`;
        errors.push(msg);
        console.error(msg);
      }

      summary.totalSitesProcessed++;
      summary.perSite.push(siteSummary);
      console.log(`[Scraper] ${config.name} done — found:${siteSummary.found}`);
    }));
  }

  summary.completedAt = Date.now();
  const elapsedSeconds = ((summary.completedAt - summary.startedAt) / 1000).toFixed(1);
  console.log(`[Scraper] Run complete in ${elapsedSeconds}s`);

  return summary;
}
