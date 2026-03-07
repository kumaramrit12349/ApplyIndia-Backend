import { Router } from "express";
import notificationRoutes from "./notification"
import userActivityRoutes from "./userActivity"

const router = Router();

router.use("/notification", notificationRoutes);
router.use("/user-activity", userActivityRoutes);

export default router;
