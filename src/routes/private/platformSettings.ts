import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import { getPlatformSettings, updatePlatformSettings } from "../../services/private/platformSettingsService";
import { IPlatformSettings } from "../../db_schema/PlatformSettings/PlatformSettingsInterface";

const router = Router();
router.use(authenticateTokenAndEmail);

const TOGGLE_FIELDS = ["email_communication_enabled", "contact_us_enabled", "guidance_enabled", "notification_enabled"] as const;

// GET /api/platform-settings
router.get("/", requireRole("admin"), async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("Error fetching platform settings:", error);
    res.status(500).json({ success: false, error: error?.message || "Failed to fetch platform settings" });
  }
});

// PATCH /api/platform-settings  { email_communication_enabled?, contact_us_enabled?, guidance_enabled?, notification_enabled? }
router.patch("/", requireRole("admin"), async (req, res) => {
  try {
    const updates: Partial<Pick<IPlatformSettings, (typeof TOGGLE_FIELDS)[number]>> = {};
    for (const field of TOGGLE_FIELDS) {
      const value = req.body?.[field];
      if (value === undefined) continue;
      if (typeof value !== "boolean") {
        return res.status(400).json({ success: false, error: `${field} must be a boolean` });
      }
      updates[field] = value;
    }

    const settings = await updatePlatformSettings(updates);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("Error updating platform settings:", error);
    res.status(500).json({ success: false, error: error?.message || "Failed to update platform settings" });
  }
});

export default router;
