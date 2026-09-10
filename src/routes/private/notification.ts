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
  markDailyVideo,
  markWeeklyVideoBulk,
  unarchiveNotification,
  viewNotifications,
  bulkPermanentDeleteNotifications,
  bulkArchiveNotifications,
} from "../../services/private/notificationService";
import {
  authenticateTokenAndEmail,
  requireRole,
  checkNotificationPermission,
  checkCanEditApproved,
  getDataWindowCutoff,
  permissionsAllowNotification,
} from "../../middlewares/authMiddleware";
import { IAdminPermissions } from "../../db_schema/User/UserInterface";
import { getUserProfile, getCognitoUserEmail } from "../../services/authService";
import { getDistributionLog, getNotificationId } from "../../services/private/notificationDistributionService";
import { getSocialPostsForNotification } from "../../services/private/socialPostService";
import { SOCIAL_PLATFORM } from "../../db_schema/SocialPost/SocialPostConstant";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { sqsClient } from "../../aws/sqs.client";
import { QUEUE_CONFIG } from "../../config/env";

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

// Add notification — Creator, Senior Reviewer, Admin (scoped by permissions)
router.post("/add", requireRole("creator", "senior_reviewer", "admin"), checkNotificationPermission(), async (req: any, res) => {
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

// View all notifications — All roles (filtered by permissions)
router.post("/view", async (req: any, res) => {
  try {
    const { search, timeRange, category, state, dailyVideoDone, weeklyVideoDone, openOnly, closingSoon } = req.body || {};
    let notifications = await viewNotifications(
      search,
      timeRange,
      category,
      state,
      typeof dailyVideoDone === "boolean" ? dailyVideoDone : undefined,
      typeof weeklyVideoDone === "boolean" ? weeklyVideoDone : undefined,
      typeof openOnly === "boolean" ? openOnly : undefined,
      typeof closingSoon === "boolean" ? closingSoon : undefined,
    );

    // Apply permission-based filtering for non-admin roles
    const role = req.adminRole;
    const permissions: IAdminPermissions | null = req.adminPermissions;

    if (role !== "admin" && permissions) {
      // Filter by allowed categories and states
      notifications = notifications.filter((n: any) =>
        permissionsAllowNotification(permissions, n.category, n.state)
      );

      // Filter by data window (based on created_at)
      const cutoff = getDataWindowCutoff(permissions.data_window);
      if (cutoff !== null) {
        notifications = notifications.filter(
          (n: any) => n.created_at && n.created_at >= cutoff
        );
      }
    }

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

// Edit notification — Creator, Senior Reviewer, Admin (scoped by permissions;
// approved notifications can only be edited by Senior Reviewer/Admin)
router.put(
  "/edit/:id",
  requireRole("creator", "senior_reviewer", "admin"),
  checkNotificationPermission(),
  checkCanEditApproved(),
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

// Approve notification — Reviewer, Senior Reviewer, Admin (scoped by permissions)
router.patch(
  "/approve/:id",
  requireRole("reviewer", "senior_reviewer", "admin"),
  checkNotificationPermission(),
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

// Archive notification — Admin, Senior Reviewer only
router.delete(
  "/delete/:id",
  requireRole("senior_reviewer", "admin"),
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

// Unarchive notification — Admin, Senior Reviewer
router.patch(
  "/unarchive/:id",
  requireRole("senior_reviewer", "admin"),
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

// Add review comment — Reviewer, Senior Reviewer, Admin
// Every comment automatically marks the notification as "changes_requested"
router.post(
  "/comment/:id",
  requireRole("reviewer", "senior_reviewer", "admin"),
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


// Mark (or unmark) a single notification's daily video — Reviewer, Senior Reviewer, Admin (scoped by permissions)
router.patch(
  "/:id/daily-video",
  requireRole("reviewer", "senior_reviewer", "admin"),
  checkNotificationPermission(),
  async (req: any, res) => {
    try {
      const { done, video_url } = req.body || {};
      if (typeof done !== "boolean") {
        return res.status(400).json({ success: false, error: "'done' (boolean) is required" });
      }
      const markedBy = await getDisplayName(req);
      const result = await markDailyVideo(req.params.id, done, video_url, markedBy);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to update daily video status" });
    }
  }
);

// Mark (or unmark) several notifications' daily video in one shot — Reviewer,
// Senior Reviewer, Admin. Reuses markDailyVideo per notification (so the
// approved-only rule is enforced the same way as the single-item route),
// collecting individual failures instead of aborting the whole batch on the
// first one so a partially-mixed selection still updates what it can.
router.patch(
  "/daily-video/bulk",
  requireRole("reviewer", "senior_reviewer", "admin"),
  async (req: any, res) => {
    try {
      const { ids, done, video_url } = req.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: "IDs array is required" });
      }
      if (typeof done !== "boolean") {
        return res.status(400).json({ success: false, error: "'done' (boolean) is required" });
      }

      const role = req.adminRole;
      const permissions: IAdminPermissions | null = req.adminPermissions;
      if (role !== "admin" && permissions) {
        const notifications = await Promise.all(ids.map((id: string) => getNotificationById(id)));
        const disallowed = ids.filter((id: string, idx: number) => {
          const n = notifications[idx];
          return !n || !permissionsAllowNotification(permissions, n.category, n.state);
        });
        if (disallowed.length > 0) {
          return res.status(403).json({
            success: false,
            error: "Access denied for one or more notifications",
            ids: disallowed,
          });
        }
      }

      const markedBy = await getDisplayName(req);
      const results = await Promise.allSettled(
        ids.map((id: string) => markDailyVideo(id, done, video_url, markedBy)),
      );
      const failed = ids.filter((_id: string, idx: number) => results[idx].status === "rejected");
      if (failed.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Some notifications could not be updated (they may not be approved)",
          ids: failed,
        });
      }
      res.json({ success: true, count: ids.length });
    } catch (error) {
      console.error("Error bulk marking daily video:", error);
      res.status(500).json({ success: false, error: "Failed to update daily video status" });
    }
  }
);

// Mark (or unmark) several notifications as covered by one weekly roundup video —
// Reviewer, Senior Reviewer, Admin. Unlike bulk-archive/bulk-delete (role-only —
// admin/senior-reviewer teardown actions), this is a routine action scoped
// users perform often, so each notification's category/state is checked
// against the caller's permissions individually rather than trusting the role alone.
router.patch(
  "/weekly-video/bulk",
  requireRole("reviewer", "senior_reviewer", "admin"),
  async (req: any, res) => {
    try {
      const { ids, done, video_url } = req.body || {};
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: "IDs array is required" });
      }
      if (typeof done !== "boolean") {
        return res.status(400).json({ success: false, error: "'done' (boolean) is required" });
      }

      const notifications = await Promise.all(ids.map((id: string) => getNotificationById(id)));

      const notApproved = ids.filter((id: string, idx: number) => !notifications[idx]?.approved_at);
      if (notApproved.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Only approved notifications can have their video status marked",
          ids: notApproved,
        });
      }

      const role = req.adminRole;
      const permissions: IAdminPermissions | null = req.adminPermissions;
      if (role !== "admin" && permissions) {
        const disallowed = ids.filter((id: string, idx: number) => {
          const n = notifications[idx];
          return !n || !permissionsAllowNotification(permissions, n.category, n.state);
        });
        if (disallowed.length > 0) {
          return res.status(403).json({
            success: false,
            error: "Access denied for one or more notifications",
            ids: disallowed,
          });
        }
      }

      const markedBy = await getDisplayName(req);
      const result = await markWeeklyVideoBulk(ids, done, video_url, markedBy);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error bulk marking weekly video:", error);
      res.status(500).json({ success: false, error: "Failed to update weekly video status" });
    }
  }
);

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

// Bulk archive — Admin, Senior Reviewer
router.delete("/bulk-archive", requireRole("senior_reviewer", "admin"), async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "IDs array is required" });
    }
    await bulkArchiveNotifications(ids);
    res.json({ success: true, message: `${ids.length} notifications archived` });
  } catch (error) {
    console.error("Error bulk archiving notifications:", error);
    res.status(500).json({ success: false, error: "Failed to bulk archive notifications" });
  }
});

// Get delivery/publishing status for a notification — Reviewer, Senior Reviewer, Admin
router.get(
  "/:id/distribution-status",
  requireRole("reviewer", "senior_reviewer", "admin"),
  async (req, res) => {
    try {
      const notification = await getNotificationById(req.params.id);
      if (!notification || !notification.sk) {
        return res.status(404).json({ success: false, error: "Notification not found" });
      }
      const log = await getDistributionLog(notification.sk);
      res.json({ success: true, distribution: log });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch distribution status" });
    }
  }
);

// Retry failed distribution for a notification — Senior Reviewer, Admin
router.post(
  "/:id/retry-distribution",
  requireRole("senior_reviewer", "admin"),
  async (req, res) => {
    try {
      const notification = await getNotificationById(req.params.id);
      if (!notification || !notification.sk) {
        return res.status(404).json({ success: false, error: "Notification not found" });
      }
      // Re-runs the queue-based fan-out (same as approval) instead of a
      // synchronous loop, since retrying could involve re-enumerating a
      // very large eligible-user list.
      if (QUEUE_CONFIG.notificationFanoutQueueUrl) {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: QUEUE_CONFIG.notificationFanoutQueueUrl,
            MessageBody: JSON.stringify({ notificationId: getNotificationId(notification.sk), mode: "retry" }),
          })
        );
      }
      const log = await getDistributionLog(notification.sk);
      res.json({ success: true, distribution: log });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to retry distribution" });
    }
  }
);

// Get social publishing status for a notification — Reviewer, Senior Reviewer, Admin
router.get(
  "/:id/social-status",
  requireRole("reviewer", "senior_reviewer", "admin"),
  async (req, res) => {
    try {
      const notification = await getNotificationById(req.params.id);
      if (!notification || !notification.sk) {
        return res.status(404).json({ success: false, error: "Notification not found" });
      }
      const socialPosts = await getSocialPostsForNotification(getNotificationId(notification.sk));
      res.json({ success: true, socialPosts });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch social publishing status" });
    }
  }
);

// Retry a failed social publication — Senior Reviewer, Admin
router.post(
  "/:id/retry-social/:platform",
  requireRole("senior_reviewer", "admin"),
  async (req, res) => {
    try {
      const { platform } = req.params;
      if (!Object.values(SOCIAL_PLATFORM).includes(platform as any)) {
        return res.status(400).json({ success: false, error: `Unknown platform: ${platform}` });
      }
      const notification = await getNotificationById(req.params.id);
      if (!notification || !notification.sk) {
        return res.status(404).json({ success: false, error: "Notification not found" });
      }
      if (QUEUE_CONFIG.notificationSocialQueueUrl) {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: QUEUE_CONFIG.notificationSocialQueueUrl,
            MessageBody: JSON.stringify({ notificationId: getNotificationId(notification.sk), platform, mode: "retry" }),
          })
        );
      }
      const socialPosts = await getSocialPostsForNotification(getNotificationId(notification.sk));
      res.json({ success: true, socialPosts });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to retry social publication" });
    }
  }
);

export default router;