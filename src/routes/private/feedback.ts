import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import { getAdminFeedback } from "../../services/private/feedbackService";

const router = Router();
router.use(authenticateTokenAndEmail);

// View feedback — Admin only
router.post(
    "/view",
    requireRole("admin"),
    async (req, res) => {
        try {
            const limit = Number(req.body.limit) || 30;
            const startKey = req.body.startKey || undefined;
            const timeRange = req.body.timeRange || "all";

            const data = await getAdminFeedback(limit, startKey, timeRange);
            res.json({ success: true, data });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                success: false,
                error: "Failed to fetch feedback",
            });
        }
    }
);

export default router;
