import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import { runScraper, getScraperEngine } from "../../scraper/scraperOrchestrator";
import { ScraperRunSummary } from "../../scraper/types";
import { 
  getAllScraperConfigs, 
  getScraperConfig, 
  createScraperConfig, 
  updateScraperConfig, 
  archiveScraperConfig,
  unarchiveScraperConfig,
  deleteScraperConfig,
  bulkDeleteScraperConfigs
} from "../../services/private/scraperConfigService";

const router = Router();

// Ensure all scraper admin routes authenticate the user token and extract the adminRole
router.use(authenticateTokenAndEmail);

// In-memory store for the last run summary (resets on Lambda cold start).
// For persistent history, this would be written to DynamoDB.
let lastRunSummary: ScraperRunSummary | null = null;
let isRunning = false;

/**
 * POST /api/scraper/run
 * Manually trigger a scrape run.
 * Role: admin only
 * Body: { dryRun?: boolean }
 */
router.post("/run", requireRole("admin"), async (req, res) => {
  if (isRunning) {
    return res.status(409).json({
      success: false,
      error: "A scraper run is already in progress",
    });
  }

  const dryRun = req.body?.dryRun === true;

  // Fire-and-forget — respond immediately, run in background
  isRunning = true;
  const runStartedAt = Date.now();

  res.json({
    success: true,
    message: dryRun
      ? "Dry-run scraper started. Check /api/scraper/status for results."
      : "Scraper started. Check /api/scraper/status for results.",
    startedAt: runStartedAt,
    dryRun,
  });

  // Run in background (don't await on response)
  runScraper(dryRun)
    .then((summary) => {
      lastRunSummary = summary;
    })
    .catch((err) => {
      console.error("[ScraperAdmin] Background run error:", err);
    })
    .finally(() => {
      isRunning = false;
    });
});

/**
 * GET /api/scraper/status
 * Get the status and summary of the last scraper run.
 * Role: admin only
 */
router.get("/status", requireRole("admin"), async (_req, res) => {
  res.json({
    success: true,
    isRunning,
    lastRun: lastRunSummary || null,
  });
});

/**
 * GET /api/scraper/sources
 * List all configured scraper source sites from DynamoDB
 * Role: admin only
 */
router.get("/sources", requireRole("admin"), async (req, res) => {
  try {
    const includeArchived = req.query.archived === "true";
    const sources = await getAllScraperConfigs(true, includeArchived);
    
    // If the user specifically wanted archived items ONLY, we can filter here
    const finalSources = includeArchived 
      ? sources.filter(s => s.is_archived) 
      : sources;

    res.json({
      success: true,
      sources: finalSources,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to fetch sources" });
  }
});

/**
 * POST /api/scraper/sources
 * Create a new scraper source configuration
 */
router.post("/sources", requireRole("admin"), async (req, res) => {
  try {
    const data = req.body;
    
    // Basic server-side validation
    if (!data.key || !data.name || !data.listingUrl) {
      return res.status(400).json({ success: false, error: "Missing required fields: key, name, and listingUrl" });
    }

    await createScraperConfig(data);
    res.json({ success: true, message: "Source configured successfully" });
  } catch (error: any) {
    const isConflict = error?.message?.includes("Conflict:");
    res.status(isConflict ? 409 : 500).json({ 
      success: false, 
      error: error?.message || "Failed to create source" 
    });
  }
});

/**
 * PUT /api/scraper/sources/:key
 * Update an existing source configuration
 */
router.put("/sources/:key", requireRole("admin"), async (req, res) => {
  try {
    const { key } = req.params;
    const updates = req.body;
    await updateScraperConfig(key, updates);
    res.json({ success: true, message: "Source updated successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to update source" });
  }
});

/**
 * DELETE /api/scraper/sources/bulk
 * Permanently delete multiple scraper configurations
 */
router.delete("/sources/bulk", requireRole("admin"), async (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ success: false, error: "Missing or invalid 'keys' array in request body" });
    }
    await bulkDeleteScraperConfigs(keys);
    res.json({ success: true, message: `${keys.length} sources deleted permanently` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to bulk delete sources" });
  }
});

/**
 * DELETE /api/scraper/sources/:key
 * Archive a scraper configuration
 */
router.delete("/sources/:key", requireRole("admin"), async (req, res) => {
  try {
    const { key } = req.params;
    await archiveScraperConfig(key);
    res.json({ success: true, message: "Source archived successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to archive source" });
  }
});

/**
 * DELETE /api/scraper/sources/:key/permanent
 * Permanently delete a scraper configuration
 */
router.delete("/sources/:key/permanent", requireRole("admin"), async (req, res) => {
  try {
    const { key } = req.params;
    await deleteScraperConfig(key);
    res.json({ success: true, message: "Source deleted permanently" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to permanently delete source" });
  }
});

/**
 * POST /api/scraper/sources/:key/unarchive
 * Restore an archived configuration
 */
router.post("/sources/:key/unarchive", requireRole("admin"), async (req, res) => {
  try {
    const { key } = req.params;
    await unarchiveScraperConfig(key);
    res.json({ success: true, message: "Source restored successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to restore source" });
  }
});

/**
 * POST /api/scraper/preview/:siteKey
 * Preview what a specific scraper would find — runs in dry-run mode
 * and returns the raw items without inserting anything.
 * Role: admin only
 */
router.post("/preview/:siteKey", requireRole("admin"), async (req, res) => {
  const { siteKey } = req.params;

  // Fetch config to preview
  const dbConfig = await getScraperConfig(siteKey);
  
  if (!dbConfig) {
    return res.status(404).json({
      success: false,
      error: `Unknown site key: ${siteKey}`,
    });
  }

  const scraperEngine = getScraperEngine(siteKey);

  try {
    const rawItems = await scraperEngine(dbConfig as any);
    // Return top 20 preview items
    const preview = rawItems.slice(0, 20).map((item: any) => ({
      title: item.rawTitle,
      href: item.href,
      dateText: item.rawDateText || null,
    }));

    res.json({
      success: true,
      siteKey,
      siteName: dbConfig.name,
      totalFound: rawItems.length,
      preview,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || "Preview failed",
    });
  }
});

export default router;
