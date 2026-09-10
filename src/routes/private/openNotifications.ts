import { Router } from "express";
import { authenticateToken } from "../../middlewares/authMiddleware";
import { getOpenNotifications } from "../../services/public/homeService";

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/open-notifications
 * Logged-in-only browse of currently-open notifications (approved, not
 * archived, deadline not passed) across every category/state, with filters.
 * Filter option lists (categories/states/departments) come from the existing
 * public /public/notification/filters endpoint — only the actual listing is
 * gated behind login.
 */
router.get("/", async (req, res) => {
  try {
    const { category, state, department, minVacancies, search, closingSoon, sortBy, sortOrder, limit, offset } = req.query;
    const result = await getOpenNotifications({
      category: typeof category === "string" ? category : undefined,
      state: typeof state === "string" ? state : undefined,
      department: typeof department === "string" ? department : undefined,
      minVacancies: minVacancies ? Number(minVacancies) : undefined,
      search: typeof search === "string" ? search : undefined,
      closingSoon: closingSoon === "true",
      sortBy: sortBy === "created_at" ? "created_at" : "last_date_to_apply",
      sortOrder: sortOrder === "desc" ? "desc" : "asc",
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: "Database error" });
  }
});

export default router;
