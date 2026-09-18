import { Router } from "express";
import notificationRoutes from "./notification"
import userActivityRoutes from "./userActivity"
import scraperAdminRoutes from "./scraperAdmin"
import adminRoleRoutes from "./adminRole"
import eligibilityRoutes from "./eligibility"
import emailTemplateRoutes from "./emailTemplate"
import usersRoutes from "./users"
import openNotificationsRoutes from "./openNotifications"
import guidanceBookingRoutes from "./guidanceBooking"
import guidanceAdminRoutes from "./guidanceAdmin"
import contactAdminRoutes from "./contactAdmin"

const router = Router();

router.use("/notification", notificationRoutes);
router.use("/user-activity", userActivityRoutes);
router.use("/scraper", scraperAdminRoutes);
router.use("/admin-roles", adminRoleRoutes);
router.use("/eligibility", eligibilityRoutes);
router.use("/email-templates", emailTemplateRoutes);
router.use("/users", usersRoutes);
router.use("/open-notifications", openNotificationsRoutes);
router.use("/guidance", guidanceBookingRoutes);
router.use("/guidance-admin", guidanceAdminRoutes);
router.use("/contact", contactAdminRoutes);

export default router;
