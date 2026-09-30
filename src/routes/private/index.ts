import { Router } from "express";
import notificationRoutes from "./notification"
import userActivityRoutes from "./userActivity"
import adminRoleRoutes from "./adminRole"
import eligibilityRoutes from "./eligibility"
import emailTemplateRoutes from "./emailTemplate"
import usersRoutes from "./users"
import openNotificationsRoutes from "./openNotifications"
import guidanceBookingRoutes from "./guidanceBooking"
import guidanceAdminRoutes from "./guidanceAdmin"
import contactAdminRoutes from "./contactAdmin"
import platformSettingsRoutes from "./platformSettings"
import testSeriesAdminRoutes from "./testSeriesAdmin"
import mockTestAdminRoutes from "./mockTestAdmin"
import mockTestRoutes from "./mockTest"

const router = Router();

router.use("/notification", notificationRoutes);
router.use("/user-activity", userActivityRoutes);
router.use("/admin-roles", adminRoleRoutes);
router.use("/eligibility", eligibilityRoutes);
router.use("/email-templates", emailTemplateRoutes);
router.use("/users", usersRoutes);
router.use("/open-notifications", openNotificationsRoutes);
router.use("/guidance", guidanceBookingRoutes);
router.use("/guidance-admin", guidanceAdminRoutes);
router.use("/contact", contactAdminRoutes);
router.use("/platform-settings", platformSettingsRoutes);
router.use("/test-series-admin", testSeriesAdminRoutes);
router.use("/mock-test-admin", mockTestAdminRoutes);
router.use("/mock-tests", mockTestRoutes);

export default router;
