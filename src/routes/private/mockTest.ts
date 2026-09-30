import { Router } from "express";
import { authenticateToken } from "../../middlewares/authMiddleware";
import {
  listPublishedSeries,
  getPublishedSeriesBySk,
  listPublishedTestsInSeries,
  getTestForTaking,
  startOrResumeAttempt,
  advanceToNextSection,
  startPracticeAttempt,
  saveAttemptProgress,
  finalizeAttempt,
  listMyAttemptsForTest,
  getMyAttempts,
  getAttemptResult,
  getAttemptReview,
  requestMoreAttempts,
} from "../../services/public/mockTestService";
import { getUserProfile } from "../../services/authService";

const router = Router();
// Logged-in-only browse/take/results — deliberately NOT admin-gated, unlike every other route in this folder's sibling *Admin.ts files.
router.use(authenticateToken);

const ERROR_STATUS_MAP: Record<string, number> = {
  FORBIDDEN: 403,
  ATTEMPT_LIMIT_REACHED: 409,
  TEST_NOT_YET_OPEN: 409,
  TEST_CLOSED: 409,
  ATTEMPT_NOT_SUBMITTED: 409,
  NO_QUESTIONS_FOR_SECTION: 400,
  ATTEMPTS_NOT_YET_EXHAUSTED: 409,
  ATTEMPT_NOT_IN_PROGRESS: 409,
  SECTION_TIMING_NOT_ENABLED: 400,
  ALREADY_LAST_SECTION: 400,
};

function respondError(res: any, error: any, fallback: string) {
  console.error(error);
  const status = ERROR_STATUS_MAP[error?.message] || (error?.message?.endsWith("_NOT_FOUND") ? 404 : 400);
  res.status(status).json({ success: false, error: error?.message || fallback });
}

// GET /api/mock-tests/series
router.get("/series", async (_req, res) => {
  try {
    const results = await listPublishedSeries();
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to list test series");
  }
});

// GET /api/mock-tests/series/:seriesId
router.get("/series/:seriesId", async (req, res) => {
  try {
    const seriesId = decodeURIComponent(req.params.seriesId);
    const series = await getPublishedSeriesBySk(seriesId);
    if (!series) return res.status(404).json({ success: false, error: "SERIES_NOT_FOUND" });
    const tests = await listPublishedTestsInSeries(seriesId);
    res.json({ success: true, data: { series, tests } });
  } catch (error) {
    respondError(res, error, "Failed to fetch test series");
  }
});

// GET /api/mock-tests/tests/:testId  — instructions + questions (no correct answers), before Start is clicked
router.get("/tests/:testId", async (req, res) => {
  try {
    const result = await getTestForTaking(decodeURIComponent(req.params.testId));
    if (!result) return res.status(404).json({ success: false, error: "TEST_NOT_FOUND" });
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to fetch test");
  }
});

// GET /api/mock-tests/tests/:testId/my-attempts  — attempts used / max, plus this test's own attempt history
router.get("/tests/:testId/my-attempts", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const result = await listMyAttemptsForTest(decodeURIComponent(req.params.testId), userSub);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to fetch attempt history");
  }
});

// POST /api/mock-tests/tests/:testId/start  — creates a new timed attempt, or resumes one already in progress
router.post("/tests/:testId/start", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const result = await startOrResumeAttempt(decodeURIComponent(req.params.testId), userSub);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to start test");
  }
});

// POST /api/mock-tests/tests/:testId/start-practice  { section? }  — untimed, never counts toward max_attempts
router.post("/tests/:testId/start-practice", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const result = await startPracticeAttempt(decodeURIComponent(req.params.testId), userSub, req.body?.section || undefined);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to start practice");
  }
});

// POST /api/mock-tests/attempts/:attemptId/next-section  — voluntarily finishes the current section early and advances (section-timed tests only)
router.post("/attempts/:attemptId/next-section", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const result = await advanceToNextSection(decodeURIComponent(req.params.attemptId), userSub);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to advance to next section");
  }
});

// PATCH /api/mock-tests/attempts/:attemptId/progress  { answers, marked_for_review?, time_per_question? }  — autosave while in progress
router.patch("/attempts/:attemptId/progress", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    await saveAttemptProgress(
      decodeURIComponent(req.params.attemptId),
      userSub,
      req.body?.answers || {},
      req.body?.marked_for_review,
      req.body?.time_per_question
    );
    res.json({ success: true });
  } catch (error) {
    respondError(res, error, "Failed to save progress");
  }
});

// POST /api/mock-tests/attempts/:attemptId/submit  { answers, marked_for_review?, time_per_question? }  — final, scored submit
router.post("/attempts/:attemptId/submit", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const attempt = await finalizeAttempt(
      decodeURIComponent(req.params.attemptId),
      userSub,
      req.body?.answers || {},
      req.body?.marked_for_review,
      req.body?.time_per_question
    );
    res.json({ success: true, data: attempt });
  } catch (error) {
    respondError(res, error, "Failed to submit attempt");
  }
});

// GET /api/mock-tests/attempts/:attemptId/review  — post-submission answer review
router.get("/attempts/:attemptId/review", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const review = await getAttemptReview(decodeURIComponent(req.params.attemptId), userSub);
    res.json({ success: true, results: review });
  } catch (error) {
    respondError(res, error, "Failed to fetch review");
  }
});

// POST /api/mock-tests/tests/:testId/request-more-attempts  { reason? }
router.post("/tests/:testId/request-more-attempts", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const profile = await getUserProfile(userSub).catch(() => null);
    const userName = profile ? `${profile.given_name || ""} ${profile.family_name || ""}`.trim() || undefined : undefined;
    const request = await requestMoreAttempts(decodeURIComponent(req.params.testId), userSub, userName, profile?.email, req.body?.reason);
    res.json({ success: true, data: request });
  } catch (error) {
    respondError(res, error, "Failed to send request");
  }
});

// GET /api/mock-tests/my-attempts
router.get("/my-attempts", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const results = await getMyAttempts(userSub);
    res.json({ success: true, results });
  } catch (error) {
    respondError(res, error, "Failed to fetch attempts");
  }
});

// GET /api/mock-tests/attempts/:attemptId
router.get("/attempts/:attemptId", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    const attempt = await getAttemptResult(decodeURIComponent(req.params.attemptId), userSub);
    if (!attempt) return res.status(404).json({ success: false, error: "ATTEMPT_NOT_FOUND" });
    res.json({ success: true, data: attempt });
  } catch (error) {
    respondError(res, error, "Failed to fetch attempt");
  }
});

export default router;
