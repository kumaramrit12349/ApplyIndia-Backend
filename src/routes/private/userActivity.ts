import { Router } from "express";
import { authenticateToken } from "../../middlewares/authMiddleware";
import {
    upsertUserActivity,
    getUserActivities,
    getUserActivityForNotification,
    deleteUserActivity,
} from "../../services/private/userActivityService";
import { USER_ACTIVITY_STATUS, ACTIVITY_STATUS_ORDER } from "../../db_schema/UserActivity/UserActivityConstant";

const router = Router();
router.use(authenticateToken);

/**
 * POST /api/user-activity/track
 * Body: { notificationSk, title, category, status }
 * Status must follow precedence: APPLIED → ADMIT_CARD → RESULT → SELECTED
 */
router.post("/track", async (req, res) => {
    try {
        const userSub = (req as any).user?.sub;
        if (!userSub) {
            return res.status(401).json({ success: false, error: "User not authenticated" });
        }

        const { notificationSk, title, category, status } = req.body;

        if (!notificationSk || !title || status === undefined || status === null) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const numericStatus = Number(status);

        if (!ACTIVITY_STATUS_ORDER.includes(numericStatus as USER_ACTIVITY_STATUS)) {
            return res.status(400).json({ success: false, error: "Invalid status value" });
        }

        const result = await upsertUserActivity(
            userSub,
            notificationSk,
            title,
            category || "",
            numericStatus as USER_ACTIVITY_STATUS
        );

        res.json({ success: true, data: result });
    } catch (error: any) {
        const msg = error.message || "";
        let statusCode = 500;
        if (msg.includes("Invalid status transition")) statusCode = 400;
        if (msg.includes("ATTEMPT_LIMIT_REACHED")) statusCode = 429;

        res.status(statusCode).json({
            success: false,
            error: msg || "Failed to track activity",
        });
    }
});

/**
 * GET /api/user-activity/list
 * Returns all tracked activities for the authenticated user.
 */
router.get("/list", async (req, res) => {
    try {
        const userSub = (req as any).user?.sub;
        if (!userSub) {
            return res.status(401).json({ success: false, error: "User not authenticated" });
        }

        const activities = await getUserActivities(userSub);
        res.json({ success: true, data: activities });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to fetch activities",
        });
    }
});

/**
 * GET /api/user-activity/check/:notificationSk
 * Check if user has tracked a specific notification.
 */
router.get("/check/:notificationSk", async (req, res) => {
    try {
        const userSub = (req as any).user?.sub;
        if (!userSub) {
            return res.status(401).json({ success: false, error: "User not authenticated" });
        }

        const notificationSk = decodeURIComponent(req.params.notificationSk);
        const activity = await getUserActivityForNotification(userSub, notificationSk);

        res.json({
            success: true,
            data: activity,
            tracked: !!activity,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to check activity",
        });
    }
});

/**
 * DELETE /api/user-activity/remove/:notificationSk
 * Remove a tracked activity.
 */
router.delete("/remove/:notificationSk", async (req, res) => {
    try {
        const userSub = (req as any).user?.sub;
        if (!userSub) {
            return res.status(401).json({ success: false, error: "User not authenticated" });
        }

        const notificationSk = decodeURIComponent(req.params.notificationSk);
        await deleteUserActivity(userSub, notificationSk);

        res.json({ success: true, message: "Activity removed" });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to remove activity",
        });
    }
});

export default router;
