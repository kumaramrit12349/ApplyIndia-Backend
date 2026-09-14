import { Router } from "express";
import homeRoutes from "./home"
import feedbackRoutes from "./feedback"
import guidanceFeedbackRoutes from "./guidanceFeedback"


const router = Router();

router.use("/notification", homeRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/guidance-feedback", guidanceFeedbackRoutes);

export default router;
