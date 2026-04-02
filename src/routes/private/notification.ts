import { Router } from "express";
import {
  addCompleteNotification,
  addReviewComment,
  approveNotification,
  archiveNotification,
  permanentDeleteNotification,
  editCompleteNotification,
  getNotificationById,
  getReviewComments,
  unarchiveNotification,
  viewNotifications,
  bulkPermanentDeleteNotifications,
} from "../../services/private/notificationService";
import {
  authenticateTokenAndEmail,
  requireRole,
} from "../../middlewares/authMiddleware";
import { getUserProfile, getCognitoUserEmail } from "../../services/authService";

const router = Router();
router.use(authenticateTokenAndEmail);

/**
 * Helper: fetch the user's display name from their DynamoDB profile.
 * Returns "Given Family (email)" or falls back to the role string.
 */
async function getDisplayName(req: any): Promise<string> {
  try {
    const sub = req.user?.sub;
    if (!sub) return req.adminRole || "Unknown";
    const profile = await getUserProfile(sub);
    if (profile) {
      const name = [profile.given_name, profile.family_name]
        .filter(Boolean)
        .join(" ");

      let email = profile.email;
      if (!email) {
        email = await getCognitoUserEmail(sub) || "";
      }

      if (name) {
        return email ? `${name} (${email})` : name;
      }
      return email || req.adminRole || "Unknown";
    }
    const fallbackEmail = await getCognitoUserEmail(sub);
    return fallbackEmail || req.adminRole || "Unknown";
  } catch {
    return req.adminRole || "Unknown";
  }
}

/******************************************************************************
 *                            ADMIN ROUTES
 *        Role guards applied per-route via requireRole middleware
 ******************************************************************************/

// Add notification — Creator, Admin
router.post("/add", requireRole("creator", "admin"), async (req: any, res) => {
  try {
    const creatorName = await getDisplayName(req);
    const notificationData = { ...req.body, created_by: creatorName };
    const result = await addCompleteNotification(notificationData);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error adding notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add notification",
    });
  }
});

// View all notifications — All roles
router.post("/view", async (req, res) => {
  try {
    const { search, timeRange, category, state } = req.body || {};
    const notifications = await viewNotifications(search, timeRange, category, state);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Get notification by ID — All roles
router.get("/getById/:id", async (req, res) => {
  try {
    const notification = await getNotificationById(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }
    // Also fetch review comments
    const comments = await getReviewComments(req.params.id);
    res.json({ success: true, notification, comments });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Edit notification — Creator, Admin
router.put(
  "/edit/:id",
  requireRole("creator", "admin"),
  async (req, res) => {
    try {
      const notification = await editCompleteNotification(
        req.params.id,
        req.body
      );
      res.json({ success: true, notification });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Database error",
      });
    }
  }
);

// Approve notification — Reviewer, Admin
router.patch(
  "/approve/:id",
  requireRole("reviewer", "admin"),
  async (req: any, res) => {
    try {
      const approverName = await getDisplayName(req);
      const notification = await approveNotification(
        req.params.id,
        approverName
      );
      res.json({ success: true, notification });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Database error",
      });
    }
  }
);

// Archive notification — Admin only
router.delete(
  "/delete/:id",
  requireRole("admin"),
  async (req, res) => {
    try {
      const notification = await archiveNotification(req.params.id);
      res.json({ success: true, notification });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Database error",
      });
    }
  }
);

// Permanent delete notification — Admin only
router.delete(
  "/delete-permanent/:id",
  requireRole("admin"),
  async (req, res) => {
    try {
      const result = await permanentDeleteNotification(req.params.id);
      res.json({ success: true, message: "Notification permanently deleted", data: result });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Database error during permanent deletion",
      });
    }
  }
);

// Unarchive notification — Admin only
router.patch(
  "/unarchive/:id",
  requireRole("admin"),
  async (req, res) => {
    try {
      const notification = await unarchiveNotification(req.params.id);
      res.json({ success: true, notification });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Failed to unarchive",
      });
    }
  }
);

// Add review comment — Reviewer, Admin
// Every comment automatically marks the notification as "changes_requested"
router.post(
  "/comment/:id",
  requireRole("reviewer", "admin"),
  async (req: any, res) => {
    try {
      const { comment_text } = req.body;
      if (!comment_text || !comment_text.trim()) {
        return res.status(400).json({
          success: false,
          error: "Comment text is required",
        });
      }
      const reviewerSub = req.user?.sub || "unknown";
      const reviewerName = await getDisplayName(req);
      const comment = await addReviewComment(
        req.params.id,
        reviewerSub,
        reviewerName,
        comment_text.trim(),
        true // always request changes when commenting
      );
      res.json({ success: true, comment });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Failed to add comment",
      });
    }
  }
);

// Get review comments — All roles
router.get("/comments/:id", async (req, res) => {
  try {
    const comments = await getReviewComments(req.params.id);
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch comments",
    });
  }
});


// Bulk permanent delete — Admin only
router.delete("/bulk-permanent-delete", requireRole("admin"), async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "IDs array is required" });
    }
    await bulkPermanentDeleteNotifications(ids);
    res.json({ success: true, message: `${ids.length} notifications deleted permanently` });
  } catch (error) {
    console.error("Error bulk deleting notifications:", error);
    res.status(500).json({ success: false, error: "Failed to bulk delete notifications" });
  }
});

export default router;