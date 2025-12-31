import { Router } from "express";
import {
  addCompleteNotification,
  approveNotification,
  archiveNotification,
  editCompleteNotification,
  getHomePageNotifications,
  getNotificationById,
  getNotificationBySlug,
  getNotificationsByCategory,
  unarchiveNotification,
  viewNotifications,
} from "../services/notificationService";
import { authenticateToken } from "../middlewares/authMiddleware";

const router = Router();
/******************************************************************************
 *   Add Notification - "POST /api/notification/add" (ADMIN / AUTH ONLY)
 ******************************************************************************/
router.post("/add", authenticateToken, async (req, res) => {
  try {
    const result = await addCompleteNotification(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error adding notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add notification",
    });
  }
});

// Get all active notifications
router.get("/view", authenticateToken, async (req, res) => {
  try {
    const notifications = await viewNotifications();
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});

// Get single notification by id (for edit/review)
router.get("/getById/:id", authenticateToken, async (req, res) => {
  try {
    const notification = await getNotificationById(req.params?.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});

// Edit notification
router.put("/edit/:id", authenticateToken, async (req, res) => {
  try {
    const notification = await editCompleteNotification(
      req.params?.id,
      req.body
    );
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});

// Approve notification
router.patch("/approve/:id", authenticateToken, async (req, res) => {
  try {
    const notification = await approveNotification(
      req.params.id,
      req.body.approved_by || "admin"
    );
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});

// Delete notification (mark is_archived = true)
router.delete("/delete/:id", authenticateToken, async (req, res) => {
  try {
    const notification = await archiveNotification(req.params.id);
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});

// Unarchive notification
router.patch("/unarchive/:id", authenticateToken, async (req, res) => {
  try {
    const notification = await unarchiveNotification(req.params.id);
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Failed to unarchive", details: err });
  }
});

// Group notifications for the HomePage (PUBLIC)
router.get("/home", async (req, res) => {
  try {
    const grouped = await getHomePageNotifications();
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});

// Get single notification by title (PUBLIC)
router.get("/getBySlug/:slug", async (req, res) => {
  try {
    const notification = await getNotificationBySlug(req.params?.slug);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err });
  }
});




// Group notifications by category for the HomePage (PUBLIC)
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const { searchValue } = req.query;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const result = await getNotificationsByCategory(
      category,
      page,
      limit,
      typeof searchValue === "string" ? searchValue : undefined
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: String(err) });
  }
});

export default router;
