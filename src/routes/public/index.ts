import { Router } from "express";
import homeRoutes from "./home"
import contactRoutes from "./contact"
import guidanceFeedbackRoutes from "./guidanceFeedback"


const router = Router();

router.use("/notification", homeRoutes);
router.use("/contact", contactRoutes);
router.use("/guidance-feedback", guidanceFeedbackRoutes);

export default router;
