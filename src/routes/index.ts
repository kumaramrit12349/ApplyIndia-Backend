import { Router, Request, Response } from "express";
import authRoutes from "./auth";
import publicRoutes from "./public";
import privateRoutes from "./private";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Welcome to ApplyIndia!" });
});

router.use("/auth", authRoutes);
router.use("/public", publicRoutes);
router.use("/api", privateRoutes);

export default router;
