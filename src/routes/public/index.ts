import { Router } from "express";
import homeRoutes from "./home"
import feedbackRoutes from "./feedback"


const router = Router();

router.use("/notification", homeRoutes);
router.use("/feedback", feedbackRoutes);

export default router;
