import { Router, Request, Response } from "express";
import authRoutes from "./auth";
import notificationRouter from "./notification";
import feedbackRoutes from "./feedback";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Welcome to ApplyIndia!" });
});

router.use("/auth", authRoutes);
router.use("/notification", notificationRouter);
router.use("/feedback", feedbackRoutes);

export default router;
