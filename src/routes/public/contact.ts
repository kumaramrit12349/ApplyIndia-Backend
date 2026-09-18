import { Router } from "express";
import { authenticateOptional } from "../../middlewares/authMiddleware";
import { submitContact } from "../../services/public/contactService";

const router = Router();

const ERROR_STATUS_MAP: Record<string, number> = {
  RATE_LIMITED: 429,
  NAME_REQUIRED: 400,
  MESSAGE_REQUIRED: 400,
};

function respondError(res: any, error: any) {
  const msg = error?.message || "Something went wrong";
  res.status(ERROR_STATUS_MAP[msg] || 500).json({ success: false, error: msg });
}

function getClientIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

// POST /public/contact — open to guests and logged-in visitors alike.
router.post("/", authenticateOptional, async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const {
      category,
      name,
      email,
      message,
      page_url,
      official_source_url,
      suggested_correction,
      broken_link_url,
      company_name,
      company_website,
      website, // honeypot
    } = req.body;

    const result = await submitContact(
      { category, name, email, message, page_url, official_source_url, suggested_correction, broken_link_url, company_name, company_website, website },
      { userSub, ip: getClientIp(req) }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
