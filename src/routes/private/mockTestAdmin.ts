import { Router } from "express";
import multer from "multer";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import {
  createMockTest,
  updateMockTest,
  publishMockTest,
  getMockTestBySk,
  listMockTestsBySeries,
  addQuestion,
  bulkAddQuestions,
  updateQuestion,
  deleteQuestion,
  listQuestionsForAdmin,
  deleteMockTestCascade,
  getTestForPreview,
  bulkAssignSections,
  listAttemptRequestsForAdmin,
  approveAttemptRequest,
  rejectAttemptRequest,
} from "../../services/private/mockTestAdminService";
import { extractTextFromDocument, parseMockTestQuestions } from "../../utils/mockTestPdfParser";

const router = Router();
router.use(authenticateTokenAndEmail);
router.use(requireRole("admin", "test_series_manager"));

// Memory storage only — the file is parsed in-process and never persisted; nothing here needs to survive past this request.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function respondError(res: any, error: any, fallback: string) {
  console.error(error);
  const status = error?.message === "UNSUPPORTED_FILE_TYPE" ? 415 : 400;
  res.status(status).json({ success: false, error: error?.message || fallback });
}

// GET /api/mock-test-admin/series/:seriesId/tests
router.get("/series/:seriesId/tests", async (req, res) => {
  try {
    const results = await listMockTestsBySeries(decodeURIComponent(req.params.seriesId));
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to list tests");
  }
});

// POST /api/mock-test-admin/series/:seriesId/tests
router.post("/series/:seriesId/tests", async (req, res) => {
  try {
    const {
      title_en,
      title_hi,
      duration_minutes,
      marks_per_correct,
      negative_marks_per_wrong,
      sections,
      max_attempts,
      available_from,
      available_to,
      section_durations,
    } = req.body;
    if (!title_en || !duration_minutes) {
      return res.status(400).json({ success: false, error: "title_en and duration_minutes are required" });
    }
    const test = await createMockTest({
      series_id: decodeURIComponent(req.params.seriesId),
      title_en,
      title_hi,
      duration_minutes,
      marks_per_correct: marks_per_correct ?? 1,
      negative_marks_per_wrong: negative_marks_per_wrong ?? 0,
      sections: Array.isArray(sections) ? sections : [],
      is_published: false,
      max_attempts: max_attempts ?? 1,
      available_from: available_from ?? undefined,
      available_to: available_to ?? undefined,
      section_durations: section_durations && Object.keys(section_durations).length > 0 ? section_durations : undefined,
    });
    res.json({ success: true, data: test });
  } catch (error) {
    respondError(res, error, "Failed to create test");
  }
});

// GET /api/mock-test-admin/tests/:testId
router.get("/tests/:testId", async (req, res) => {
  try {
    const test = await getMockTestBySk(decodeURIComponent(req.params.testId));
    if (!test) return res.status(404).json({ success: false, error: "TEST_NOT_FOUND" });
    res.json({ success: true, data: test });
  } catch (error) {
    respondError(res, error, "Failed to fetch test");
  }
});

// PATCH /api/mock-test-admin/tests/:testId
router.patch("/tests/:testId", async (req, res) => {
  try {
    await updateMockTest(decodeURIComponent(req.params.testId), req.body);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update test");
  }
});

// GET /api/mock-test-admin/tests/:testId/preview  — same shape aspirants see, regardless of publish state
router.get("/tests/:testId/preview", async (req, res) => {
  try {
    const result = await getTestForPreview(decodeURIComponent(req.params.testId));
    if (!result) return res.status(404).json({ success: false, error: "TEST_NOT_FOUND" });
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to load preview");
  }
});

// PATCH /api/mock-test-admin/tests/:testId/publish  { is_published }
router.patch("/tests/:testId/publish", async (req, res) => {
  try {
    await publishMockTest(decodeURIComponent(req.params.testId), !!req.body.is_published);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update publish state");
  }
});

// DELETE /api/mock-test-admin/tests/:testId
router.delete("/tests/:testId", async (req, res) => {
  try {
    await deleteMockTestCascade(decodeURIComponent(req.params.testId));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to delete test");
  }
});

// GET /api/mock-test-admin/tests/:testId/questions
router.get("/tests/:testId/questions", async (req, res) => {
  try {
    const results = await listQuestionsForAdmin(decodeURIComponent(req.params.testId));
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to list questions");
  }
});

// POST /api/mock-test-admin/tests/:testId/questions  — one-at-a-time authoring
router.post("/tests/:testId/questions", async (req, res) => {
  try {
    const { question_en, question_hi, options_en, options_hi, correct_option_index, section, order, explanation_en, explanation_hi } = req.body;
    if (!question_en || !Array.isArray(options_en) || options_en.length !== 4 || correct_option_index === undefined || !section) {
      return res.status(400).json({ success: false, error: "question_en, 4 options_en, correct_option_index, and section are required" });
    }
    const question = await addQuestion(decodeURIComponent(req.params.testId), {
      question_en,
      question_hi,
      options_en: options_en as [string, string, string, string],
      options_hi: options_hi as [string, string, string, string] | undefined,
      correct_option_index,
      section,
      order: order ?? Date.now(),
      explanation_en,
      explanation_hi,
    });
    res.json({ success: true, data: question });
  } catch (error) {
    respondError(res, error, "Failed to add question");
  }
});

// PATCH /api/mock-test-admin/questions/:questionId
router.patch("/questions/:questionId", async (req, res) => {
  try {
    await updateQuestion(decodeURIComponent(req.params.questionId), req.body);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to update question");
  }
});

// DELETE /api/mock-test-admin/questions/:questionId
router.delete("/questions/:questionId", async (req, res) => {
  try {
    await deleteQuestion(decodeURIComponent(req.params.questionId));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to delete question");
  }
});

// POST /api/mock-test-admin/parse-document  (multipart, field name "file")
// Stateless — extracts + parses text and returns candidate questions for the
// admin to review/edit in the browser. Nothing is written to DynamoDB here;
// that only happens once the admin confirms via the bulk endpoint below, so
// a bad parse can never silently reach live exam content.
router.post("/parse-document", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });
    const text = await extractTextFromDocument(req.file.buffer, req.file.mimetype);
    const questions = parseMockTestQuestions(text);
    res.json({ success: true, data: questions });
  } catch (error) {
    respondError(res, error, "Failed to parse document");
  }
});

// POST /api/mock-test-admin/tests/:testId/questions/bulk  { questions: IParsedMockTestQuestion[] }
// Confirms a reviewed (possibly hand-edited) batch from parse-document above.
router.post("/tests/:testId/questions/bulk", async (req, res) => {
  try {
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (questions.length === 0) return res.status(400).json({ success: false, error: "No questions provided" });
    const existing = await listQuestionsForAdmin(decodeURIComponent(req.params.testId));
    const startOrder = existing.length > 0 ? Math.max(...existing.map((q) => q.order ?? 0)) + 1 : 0;
    const created = await bulkAddQuestions(decodeURIComponent(req.params.testId), questions, startOrder);
    res.json({ success: true, data: created });
  } catch (error) {
    respondError(res, error, "Failed to save imported questions");
  }
});

// PATCH /api/mock-test-admin/tests/:testId/questions/sections  { ranges: { from, to, section }[] }
// Bulk-divides the test's questions into sections by position range (e.g.
// 1-30 -> Hindi, 31-70 -> Maths, 71-150 -> GK) instead of tagging one at a time.
router.patch("/tests/:testId/questions/sections", async (req, res) => {
  try {
    const ranges = Array.isArray(req.body?.ranges) ? req.body.ranges : [];
    if (ranges.length === 0) return res.status(400).json({ success: false, error: "No ranges provided" });
    for (const r of ranges) {
      if (!r.section || !Number.isFinite(r.from) || !Number.isFinite(r.to) || r.from < 1 || r.to < r.from) {
        return res.status(400).json({ success: false, error: "Each range needs a valid from/to/section" });
      }
    }
    await bulkAssignSections(decodeURIComponent(req.params.testId), ranges);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to assign sections");
  }
});

// GET /api/mock-test-admin/tests/:testId/attempt-requests
router.get("/tests/:testId/attempt-requests", async (req, res) => {
  try {
    const results = await listAttemptRequestsForAdmin(decodeURIComponent(req.params.testId));
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to list attempt requests");
  }
});

// POST /api/mock-test-admin/attempt-requests/:requestId/approve  { granted_max_attempts }
router.post("/attempt-requests/:requestId/approve", async (req, res) => {
  try {
    const grantedMaxAttempts = Number(req.body?.granted_max_attempts);
    if (!Number.isFinite(grantedMaxAttempts) || grantedMaxAttempts < 1) {
      return res.status(400).json({ success: false, error: "granted_max_attempts must be a positive number" });
    }
    await approveAttemptRequest(decodeURIComponent(req.params.requestId), grantedMaxAttempts);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to approve request");
  }
});

// POST /api/mock-test-admin/attempt-requests/:requestId/reject
router.post("/attempt-requests/:requestId/reject", async (req, res) => {
  try {
    await rejectAttemptRequest(decodeURIComponent(req.params.requestId));
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to reject request");
  }
});

export default router;
