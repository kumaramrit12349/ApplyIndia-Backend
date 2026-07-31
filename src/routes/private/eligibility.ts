import { Router } from "express";
import { authenticateToken } from "../../middlewares/authMiddleware";
import { getUserProfile } from "../../services/authService";
import { getNotificationById } from "../../services/private/notificationService";
import {
    checkEligibility,
    getMissingCoreProfileFields,
    filterEligibleNotifications,
} from "../../services/private/eligibilityService";
import { getActiveNotificationsForFilter } from "../../services/public/homeService";
import { TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { NOTIFICATION_TYPE_MAPPER } from "../../db_schema/Notification/NotificationConstant";

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/eligibility/check/:id
 * Compares the authenticated user's profile against a notification's
 * eligibility criteria (age, qualification, specialization, percentage, domicile).
 */
router.get("/check/:id", async (req, res) => {
    try {
        const userSub = (req as any).user?.sub;
        if (!userSub) {
            return res.status(401).json({ success: false, error: "User not authenticated" });
        }

        const [user, notification] = await Promise.all([
            getUserProfile(userSub),
            getNotificationById(req.params.id),
        ]);

        if (!notification) {
            return res.status(404).json({ success: false, error: "Notification not found" });
        }
        if (!user) {
            return res.status(404).json({ success: false, error: "User profile not found" });
        }

        const result = checkEligibility(user, notification);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to check eligibility" });
    }
});

/**
 * GET /api/eligibility/eligible-notifications?category=X  or  ?state=X
 * Returns only the active notifications (approved, not archived, deadline not
 * passed) the authenticated user is eligible for, for a given category or state.
 */
router.get("/eligible-notifications", async (req, res) => {
    try {
        const userSub = (req as any).user?.sub;
        if (!userSub) {
            return res.status(401).json({ success: false, error: "User not authenticated" });
        }

        const category = typeof req.query.category === "string" ? req.query.category : undefined;
        const state = typeof req.query.state === "string" ? req.query.state : undefined;
        if (!category && !state) {
            return res.status(400).json({ success: false, error: "category or state query param is required" });
        }

        const user = await getUserProfile(userSub);
        if (!user) {
            return res.status(404).json({ success: false, error: "User profile not found" });
        }

        const missingProfileFields = getMissingCoreProfileFields(user);
        if (missingProfileFields.length > 0) {
            return res.json({
                success: true,
                incompleteProfile: true,
                missingProfileFields,
                notifications: [],
            });
        }

        const activeNotifications = await getActiveNotificationsForFilter(
            category ? "category" : "state",
            (category || state) as string
        );
        const eligible = filterEligibleNotifications(user, activeNotifications);

        res.json({
            success: true,
            incompleteProfile: false,
            missingProfileFields: [],
            notifications: eligible.map((n) => ({
                title: n.title,
                sk: (n.sk || "")
                    .replace(TABLE_PK_MAPPER.Notification, "")
                    .replace(NOTIFICATION_TYPE_MAPPER.META, ""),
                state: n.state,
                last_date_to_apply: n.last_date_to_apply,
                created_at: n.created_at,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to fetch eligible notifications" });
    }
});

export default router;
