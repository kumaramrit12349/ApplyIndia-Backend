import { Router } from "express";
import { getPublicFeedback } from "../../services/public/guidanceFeedbackService";

const router = Router();

// GET /public/guidance-feedback
router.get("/", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const data = await getPublicFeedback(limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to fetch testimonials" });
  }
});

export default router;
