import { Router } from "express";
import notificationRoutes from "./notification"
import userActivityRoutes from "./userActivity"
import feedbackRoutes from "./feedback"

const router = Router();

router.use("/notification", notificationRoutes);
router.use("/user-activity", userActivityRoutes);
router.use("/feedback", feedbackRoutes);

export default router;
