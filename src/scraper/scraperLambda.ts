import { runScraper } from "./scraperOrchestrator";

/**
 * AWS Lambda handler for the scheduled scraper.
 * Invoked by EventBridge on a cron schedule (every 4 hours).
 */
export const handler = async (event: any): Promise<any> => {
  console.log("[ScraperLambda] Invoked at", new Date().toISOString(), "Event:", JSON.stringify(event));

  const dryRun = event?.dryRun === true;

  try {
    const summary = await runScraper(dryRun);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        summary,
      }),
    };
  } catch (error: any) {
    console.error("[ScraperLambda] Fatal error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
    };
  }
};
