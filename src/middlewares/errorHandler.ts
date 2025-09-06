import { Request, Response, NextFunction } from "express";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("Error:", err.message || err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
}
