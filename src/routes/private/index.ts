import { Router } from "express";
import notificationRoutes from "./notification"

const router = Router();

router.use("/notification", notificationRoutes);

export default router;
