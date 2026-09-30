import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import {
  createTestSeries,
  listAllTestSeries,
  getTestSeriesBySk,
  updateTestSeries,
  publishTestSeries,
  deleteTestSeriesCascade,
} from "../../services/private/testSeriesAdminService";

const router = Router();
router.use(authenticateTokenAndEmail);
router.use(requireRole("admin", "test_series_manager"));

function respondError(res: any, error: any, fallback: string) {
  console.error(error);
  res.status(400).json({ success: false, error: error?.message || fallback });
}

// GET /api/test-series-admin
router.get("/", async (_req, res) => {
  try {
    const results = await listAllTestSeries();
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to list test series");
  }
});

// POST /api/test-series-admin  { exam_tag, title_en, title_hi?, description_en?, description_hi? }
router.post("/", async (req, res) => {
  try {
    const { exam_tag, title_en, title_hi, description_en, description_hi } = req.body;
    if (!exam_tag || !title_en) return res.status(400).json({ success: false, error: "exam_tag and title_en are required" });
    const series = await createTestSeries({ exam_tag, title_en, title_hi, description_en, description_hi, is_published: false });
    res.json({ success: true, data: series });
  } catch (error) {
    respondError(res, error, "Failed to create test series");
  }
});

// GET /api/test-series-admin/:id
router.get("/:id", async (req, res) => {
  try {
    const series = await getTestSeriesBySk(decodeURIComponent(req.params.id));
    if (!series) return res.status(404).json({ success: false, error: "SERIES_NOT_FOUND" });
    res.json({ success: true, data: series });
  } catch (error) {
    respondError(res, error, "Failed to fetch test series");
  }
});

// PATCH /api/test-series-admin/:id
router.patch("/:id", async (req, res) => {
  try {
    await updateTestSeries(decodeURIComponent(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update test series");
  }
});

// PATCH /api/test-series-admin/:id/publish  { is_published }
router.patch("/:id/publish", async (req, res) => {
  try {
    await publishTestSeries(decodeURIComponent(req.params.id), !!req.body.is_published);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update publish state");
  }
});

// DELETE /api/test-series-admin/:id
router.delete("/:id", async (req, res) => {
  try {
    await deleteTestSeriesCascade(decodeURIComponent(req.params.id));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to delete test series");
  }
});

export default router;
