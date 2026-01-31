import { Router } from "express";
import {
  getHomePageNotifications,
  getNotificationsByCategory,
} from "../../services/public/homeService";
import { getNotificationById } from "../../services/private/notificationService";

const router = Router();

/******************************************************************************
 *                            PUBLIC ROUTES
 ******************************************************************************/
// Home page notifications
router.get("/home", async (_req, res) => {
  try {
    const grouped = await getHomePageNotifications();
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Category + search + pagination
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const { searchValue, lastEvaluatedKey } = req.query;
    const limit = Number(req.query.limit) || 20;
    const result = await getNotificationsByCategory(
      category,
      limit,
      typeof lastEvaluatedKey === "string" ? lastEvaluatedKey : undefined,
      typeof searchValue === "string" ? searchValue : undefined
    );
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Get notification by ID
router.get("/getById/:id", async (req, res) => {
  try {
    const notification = await getNotificationById(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

export default router;
