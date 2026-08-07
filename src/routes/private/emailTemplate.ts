import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import {
  getAllEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  renderEmailTemplate,
} from "../../services/private/emailTemplateService";

// Sample values used to render a preview — a real send substitutes actual
// notification data, but for previewing a template's design these just
// need to be representative, non-empty strings.
const PREVIEW_SAMPLE_VARIABLES: Record<string, string> = {
  title: "SSC CGL 2026 Recruitment — Combined Graduate Level Examination",
  category: "job",
  last_date_to_apply: "31 Dec 2026",
  url: "https://applyindia.online/notification/ssc-cgl-2026/sample-id",
};

const router = Router();

router.use(authenticateTokenAndEmail);

/**
 * GET /api/email-templates
 * List all email templates. Role: admin only (system-wide email content).
 */
router.get("/", requireRole("admin"), async (_req, res) => {
  try {
    const templates = await getAllEmailTemplates();
    res.json({ success: true, templates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch email templates" });
  }
});

/**
 * GET /api/email-templates/:key
 */
router.get("/:key", requireRole("admin"), async (req, res) => {
  try {
    const template = await getEmailTemplate(req.params.key);
    if (!template) {
      return res.status(404).json({ success: false, error: "Email template not found" });
    }
    res.json({ success: true, template });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch email template" });
  }
});

/**
 * GET /api/email-templates/:key/preview
 * Renders the template with the shared header/footer and sample
 * placeholder values, returning raw HTML (not JSON) so it can be opened
 * directly in a browser tab to see exactly what the real email looks like.
 */
router.get("/:key/preview", requireRole("admin"), async (req, res) => {
  try {
    const rendered = await renderEmailTemplate(req.params.key, PREVIEW_SAMPLE_VARIABLES);
    if (!rendered) {
      return res
        .status(404)
        .type("html")
        .send(`<p style="font-family:sans-serif;padding:24px;">No email template found for key "${req.params.key}".</p>`);
    }
    res.type("html").send(rendered.html);
  } catch (err: any) {
    res
      .status(500)
      .type("html")
      .send(`<p style="font-family:sans-serif;padding:24px;">Failed to render preview: ${err.message || "Unknown error"}</p>`);
  }
});

/**
 * POST /api/email-templates
 * Body: { key, subject, body, description? }
 */
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { key, subject, body } = req.body || {};
    if (!key || !subject || !body) {
      return res.status(400).json({ success: false, error: "key, subject, and body are required" });
    }
    await createEmailTemplate(req.body);
    res.json({ success: true, message: "Email template created successfully" });
  } catch (err: any) {
    res.status(err.message?.startsWith("Conflict") ? 409 : 500).json({ success: false, error: err.message || "Failed to create email template" });
  }
});

/**
 * PUT /api/email-templates/:key
 * Body: { subject?, body?, description? }
 */
router.put("/:key", requireRole("admin"), async (req, res) => {
  try {
    await updateEmailTemplate(req.params.key, req.body || {});
    res.json({ success: true, message: "Email template updated successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to update email template" });
  }
});

/**
 * DELETE /api/email-templates/:key
 */
router.delete("/:key", requireRole("admin"), async (req, res) => {
  try {
    await deleteEmailTemplate(req.params.key);
    res.json({ success: true, message: "Email template deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to delete email template" });
  }
});

export default router;
