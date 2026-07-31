import { Router } from "express";
import { authenticateToken } from "../../middlewares/authMiddleware";
import { getUserProfile } from "../../services/authService";
import { getNotificationById } from "../../services/private/notificationService";
import { checkEligibility } from "../../services/private/eligibilityService";

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

export default router;
