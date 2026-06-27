import { Router } from "express";
import notificationRoutes from "./notification"
import userActivityRoutes from "./userActivity"
import feedbackRoutes from "./feedback"
import scraperAdminRoutes from "./scraperAdmin"
import adminRoleRoutes from "./adminRole"

const router = Router();

router.use("/notification", notificationRoutes);
router.use("/user-activity", userActivityRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/scraper", scraperAdminRoutes);
router.use("/admin-roles", adminRoleRoutes);

export default router;
