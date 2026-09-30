import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { MOCK_TEST_ITEM_TYPE } from "../../db_schema/MockTest/MockTestConstant";
import { IMockTest, IMockTestQuestion } from "../../db_schema/MockTest/MockTestInterface";
import { ITestSeries } from "../../db_schema/TestSeries/TestSeriesInterface";
import { IMockTestAttempt, IMockTestSectionBreakdown } from "../../db_schema/MockTestAttempt/MockTestAttemptInterface";
import { MOCK_TEST_ATTEMPT_STATUS } from "../../db_schema/MockTestAttempt/MockTestAttemptConstant";
import { IMockTestAttemptRequest } from "../../db_schema/MockTestAttemptRequest/MockTestAttemptRequestInterface";
import { MOCK_TEST_ATTEMPT_REQUEST_STATUS } from "../../db_schema/MockTestAttemptRequest/MockTestAttemptRequestConstant";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { questionSkPrefix, getMockTestBySk } from "../private/mockTestAdminService";
import { logErrorLocation } from "../../utils/errorUtils";
import { seededShuffle, seededPermutation } from "../../utils/deterministicShuffle";

/** A Question shape safe to hand to an aspirant taking the test — never includes the correct answer or its (admin-only) explanation. */
export type IPublicMockTestQuestion = Omit<IMockTestQuestion, "correct_option_index" | "type" | "explanation_en" | "explanation_hi">;

/** Everything the frontend needs to run a section-locked timer without reconstructing the logic itself. Absent entirely when the test doesn't use section-wise timing. */
export interface ISectionTimingInfo {
  currentIndex: number;
  currentSectionName: string;
  totalSections: number;
  sectionDurationMinutes: number;
  sectionStartedAt: number;
  isLastSection: boolean;
}

function isSectionTimingEnabled(test: IMockTest): boolean {
  return !!test.section_durations && Object.keys(test.section_durations).length > 0 && test.sections.length > 0;
}

function buildSectionTimingInfo(test: IMockTest, index: number, sectionStartedAt: number): ISectionTimingInfo {
  const currentSectionName = test.sections[index];
  return {
    currentIndex: index,
    currentSectionName,
    totalSections: test.sections.length,
    sectionDurationMinutes: test.section_durations![currentSectionName] ?? 0,
    sectionStartedAt,
    isLastSection: index === test.sections.length - 1,
  };
}

/**
 * Walks forward through however many sections have already fully elapsed
 * while the student was away (could be more than one) — each section
 * boundary lands exactly at its own deadline rather than "now", so no time
 * drifts forward just because they happened to check back late.
 */
function advanceExpiredSections(
  test: IMockTest,
  startIndex: number,
  startSectionStartedAt: number
): { index: number; sectionStartedAt: number; allSectionsExhausted: boolean } {
  let index = startIndex;
  let sectionStartedAt = startSectionStartedAt;
  const durations = test.section_durations!;
  while (index < test.sections.length) {
    const durationMs = (durations[test.sections[index]] ?? 0) * 60 * 1000;
    if (Date.now() - sectionStartedAt < durationMs) break;
    sectionStartedAt += durationMs;
    index += 1;
  }
  return { index, sectionStartedAt, allSectionsExhausted: index >= test.sections.length };
}

export interface IAttemptReviewQuestion {
  sk: string;
  section: string;
  question_en: string;
  question_hi?: string;
  options_en: [string, string, string, string];
  options_hi?: [string, string, string, string];
  /** Index into the arrays above — undefined if left unanswered. */
  given_answer_index?: number;
  correct_answer_index: number;
  is_correct: boolean;
  explanation_en?: string;
  explanation_hi?: string;
  time_spent_seconds: number;
}

async function listPublishedMockTestsBySeries(seriesId: string): Promise<IMockTest[]> {
  const all = await fetchDynamoDB<IMockTest>(ALL_TABLE_NAMES.MockTest, undefined, ["*"]);
  return all.filter((t) => t.type === MOCK_TEST_ITEM_TYPE.TEST && t.series_id === seriesId && t.is_published);
}

export interface IPublicTestSeries extends ITestSeries {
  test_count: number;
  /** First few published test titles, for the catalog card preview. */
  test_title_previews: { title_en: string; title_hi?: string }[];
}

export async function listPublishedSeries(): Promise<IPublicTestSeries[]> {
  const allSeries = await fetchDynamoDB<ITestSeries>(ALL_TABLE_NAMES.TestSeries, undefined, ["*"]);
  const published = allSeries.filter((s) => s.is_published);
  return Promise.all(
    published.map(async (series) => {
      const tests = await listPublishedMockTestsBySeries(series.sk!);
      return {
        ...series,
        test_count: tests.length,
        test_title_previews: tests.slice(0, 3).map((t) => ({ title_en: t.title_en, title_hi: t.title_hi })),
      };
    })
  );
}

export async function getPublishedSeriesBySk(sk: string): Promise<ITestSeries | null> {
  const results = await fetchDynamoDB<ITestSeries>(ALL_TABLE_NAMES.TestSeries, sk);
  const series = results[0];
  return series && series.is_published ? series : null;
}

export async function listPublishedTestsInSeries(seriesId: string): Promise<IMockTest[]> {
  return listPublishedMockTestsBySeries(seriesId);
}

async function getPublishedTest(testSk: string): Promise<IMockTest | null> {
  const results = await fetchDynamoDB<IMockTest>(ALL_TABLE_NAMES.MockTest, testSk);
  const test = results[0];
  return test && test.type === MOCK_TEST_ITEM_TYPE.TEST && test.is_published ? test : null;
}

export type TestScheduleState = "OPEN" | "NOT_YET_OPEN" | "CLOSED";

/** A test can be published but still outside its optional scheduled window — checked only for real (non-practice) attempts. */
export function getTestScheduleState(test: IMockTest): TestScheduleState {
  const now = Date.now();
  if (test.available_from && now < test.available_from) return "NOT_YET_OPEN";
  if (test.available_to && now > test.available_to) return "CLOSED";
  return "OPEN";
}

async function getQuestionsWithAnswers(testSk: string): Promise<IMockTestQuestion[]> {
  const results = await fetchDynamoDB<IMockTestQuestion>(
    ALL_TABLE_NAMES.MockTest,
    undefined,
    ["*"],
    undefined,
    undefined,
    undefined,
    true,
    questionSkPrefix(testSk)
  );
  return results.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** The test-taking payload — questions in authored order with correct answers stripped. Used by the instructions page (before Start is clicked, so no attempt/shuffle-seed exists yet). */
export async function getTestForTaking(
  testSk: string
): Promise<{ test: IMockTest; questions: IPublicMockTestQuestion[] } | null> {
  const test = await getPublishedTest(testSk);
  if (!test) return null;
  const questions = await getQuestionsWithAnswers(testSk);
  return { test, questions: questions.map(({ correct_option_index, type, explanation_en, explanation_hi, ...rest }) => rest) };
}

/**
 * Per-attempt option permutation — displayedIndex -> canonicalIndex. Pure
 * function of (seed, questionSk), so it's regenerated identically every time
 * rather than stored: at serve-time (to shuffle options for display), at
 * scoring-time (to translate a submitted displayed index back to canonical
 * before comparing to correct_option_index), and at review-time.
 */
function optionPermutationFor(seed: string, questionSk: string): number[] {
  return seededPermutation(4, `${seed}:opts:${questionSk}`);
}

/** Per-attempt question order — same seed always reproduces the same order (so a refresh/resume sees an identical layout), different seeds (different attempts) get different orders. */
function questionOrderFor(questions: IMockTestQuestion[], seed: string): IMockTestQuestion[] {
  return seededShuffle(questions, `${seed}:order`);
}

function toPublicShuffled(questions: IMockTestQuestion[], seed: string): IPublicMockTestQuestion[] {
  return questionOrderFor(questions, seed).map((q) => {
    const perm = optionPermutationFor(seed, q.sk!);
    const options_en = perm.map((i) => q.options_en[i]) as [string, string, string, string];
    const options_hi = q.options_hi ? (perm.map((i) => q.options_hi![i]) as [string, string, string, string]) : undefined;
    const { correct_option_index, type, explanation_en, explanation_hi, ...rest } = q;
    return { ...rest, options_en, options_hi };
  });
}

/** Every attempt (any status) this user has ever made on this test — its own partition, cheap query+filter. */
async function getAttemptsForUserAndTest(testSk: string, userSub: string): Promise<IMockTestAttempt[]> {
  return fetchDynamoDB<IMockTestAttempt>(
    ALL_TABLE_NAMES.MockTestAttempt,
    undefined,
    ["*"],
    { test_id: testSk, user_sub: userSub },
    "#test_id = :test_id and #user_sub = :user_sub"
  );
}

/**
 * The higher of the test's default cap and any APPROVED per-student override
 * — a rejected/pending request never raises the limit, and an approved one
 * only ever raises it (never lowers it below the test default), so admins
 * can't accidentally lock a student out below what everyone else gets.
 */
export async function getEffectiveMaxAttempts(testSk: string, userSub: string, testMaxAttempts: number): Promise<number> {
  const requests = await fetchDynamoDB<IMockTestAttemptRequest>(
    ALL_TABLE_NAMES.MockTestAttemptRequest,
    undefined,
    ["*"],
    { test_id: testSk, user_sub: userSub },
    "#test_id = :test_id and #user_sub = :user_sub"
  );
  const approved = requests.filter((r) => r.status === MOCK_TEST_ATTEMPT_REQUEST_STATUS.APPROVED);
  const bestGrant = approved.reduce((max, r) => Math.max(max, r.granted_max_attempts ?? 0), 0);
  // Defends against tests created before max_attempts existed on the schema — an
  // undefined/zero value here would otherwise propagate through Math.max as NaN
  // (which JSON-serializes to null, which loose-compares as 0 on the frontend),
  // silently locking every such test at "0 attempts used >= 0 allowed".
  const safeTestMax = Number.isFinite(testMaxAttempts) && testMaxAttempts > 0 ? testMaxAttempts : 1;
  return Math.max(safeTestMax, bestGrant);
}

/** Scores using each question's own per-attempt option permutation, so a shuffled display order never affects correctness. */
function computeScore(
  test: IMockTest,
  questions: IMockTestQuestion[],
  answers: Record<string, number>,
  seed: string
): { score: number; total_marks: number; section_breakdown: Record<string, IMockTestSectionBreakdown> } {
  let score = 0;
  const sectionBreakdown: Record<string, IMockTestSectionBreakdown> = {};
  for (const q of questions) {
    const bucket = sectionBreakdown[q.section] || { correct: 0, total: 0, score: 0 };
    bucket.total += 1;
    const displayed = answers[q.sk!];
    if (displayed !== undefined) {
      const canonical = optionPermutationFor(seed, q.sk!)[displayed];
      if (canonical === q.correct_option_index) {
        score += test.marks_per_correct;
        bucket.correct += 1;
        bucket.score += test.marks_per_correct;
      } else {
        score -= test.negative_marks_per_wrong;
        bucket.score -= test.negative_marks_per_wrong;
      }
    }
    sectionBreakdown[q.section] = bucket;
  }
  return { score, total_marks: questions.length * test.marks_per_correct, section_breakdown: sectionBreakdown };
}

export interface IRankingStats {
  percentile?: number;
  rank?: number;
  total_participants?: number;
  top_score?: number;
}

/**
 * Computed once, at submit time, against every other SUBMITTED, non-practice
 * attempt on this same test — not live/recomputed later, so an attempt's
 * percentile/rank stay fixed even as more people take the test afterward.
 * Practice attempts never enter this comparison pool and never get ranked.
 */
async function computeRankingStats(testSk: string, myScore: number, isPractice: boolean | undefined): Promise<IRankingStats> {
  if (isPractice) return {};
  const priorAttempts = await fetchDynamoDB<IMockTestAttempt>(
    ALL_TABLE_NAMES.MockTestAttempt,
    undefined,
    ["score", "status", "is_practice"],
    { test_id: testSk },
    "#test_id = :test_id"
  );
  const comparable = priorAttempts.filter((a) => a.status === MOCK_TEST_ATTEMPT_STATUS.SUBMITTED && !a.is_practice);
  const totalIncludingMine = comparable.length + 1;
  const scoredLower = comparable.filter((a) => (a.score ?? 0) < myScore).length;
  const scoredHigher = comparable.filter((a) => (a.score ?? 0) > myScore).length;
  const topScore = comparable.reduce((max, a) => Math.max(max, a.score ?? 0), myScore);
  return {
    percentile: Math.round((scoredLower / totalIncludingMine) * 100),
    rank: scoredHigher + 1,
    total_participants: totalIncludingMine,
    top_score: topScore,
  };
}

/** Shared by the user-initiated submit and the auto-finalize-on-expiry path below — scores, computes ranking stats, and flips the same attempt row to SUBMITTED. */
async function finalizeAttemptInternal(
  test: IMockTest,
  attempt: IMockTestAttempt,
  finalAnswers: Record<string, 0 | 1 | 2 | 3>,
  finalMarkedForReview?: string[],
  finalTimePerQuestion?: Record<string, number>
): Promise<IMockTestAttempt> {
  const questions = await getQuestionsWithAnswers(test.sk!);
  const seed = attempt.sk!;
  const { score, total_marks, section_breakdown } = computeScore(test, questions, finalAnswers, seed);
  const ranking = await computeRankingStats(test.sk!, score, attempt.is_practice);
  const submitted_at = Date.now();
  const marked_for_review = finalMarkedForReview ?? attempt.marked_for_review ?? [];
  const time_per_question = finalTimePerQuestion ?? attempt.time_per_question ?? {};
  await updateDynamoDB(TABLE_PK_MAPPER.MockTestAttempt, attempt.sk!, {
    status: MOCK_TEST_ATTEMPT_STATUS.SUBMITTED,
    answers: finalAnswers,
    marked_for_review,
    time_per_question,
    score,
    total_marks,
    section_breakdown,
    submitted_at,
    ...ranking,
  });
  return {
    ...attempt,
    status: MOCK_TEST_ATTEMPT_STATUS.SUBMITTED,
    answers: finalAnswers,
    marked_for_review,
    time_per_question,
    score,
    total_marks,
    section_breakdown,
    submitted_at,
    ...ranking,
  };
}

/**
 * Starts a fresh timed attempt, or resumes one already in progress — called
 * when the student clicks "Start Test". An attempt is created (and counts
 * toward the attempt limit) at this point, not at submit, so refreshing the
 * page can never grant a free extra try or a reset timer: the same
 * in-progress row (with its original started_at and autosaved answers) is
 * handed back instead. If that in-progress attempt's time has already run
 * out (e.g. they closed the tab and came back a day later), it's finalized
 * on the spot using whatever was last autosaved, then a fresh attempt is
 * considered under the normal limit check below.
 *
 * Each attempt gets its own deterministic question-order and per-question
 * option shuffle, seeded off the attempt's own sk — stable across
 * resumes/refreshes, different from every other student's attempt.
 */
export async function startOrResumeAttempt(
  testSk: string,
  userSub: string
): Promise<{ attempt: IMockTestAttempt; test: IMockTest; questions: IPublicMockTestQuestion[]; sectionTiming?: ISectionTimingInfo }> {
  const test = await getPublishedTest(testSk);
  if (!test) throw new Error("TEST_NOT_FOUND");
  const sectionTimingEnabled = isSectionTimingEnabled(test);

  const existing = await getAttemptsForUserAndTest(testSk, userSub);
  const inProgress = existing.find((a) => a.status === MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS);
  let submittedCount = existing.filter((a) => a.status === MOCK_TEST_ATTEMPT_STATUS.SUBMITTED && !a.is_practice).length;

  if (inProgress) {
    if (sectionTimingEnabled) {
      const startIndex = inProgress.current_section_index ?? 0;
      const startSectionStartedAt = inProgress.section_started_at ?? inProgress.started_at;
      const { index, sectionStartedAt, allSectionsExhausted } = advanceExpiredSections(test, startIndex, startSectionStartedAt);
      if (!allSectionsExhausted) {
        if (index !== startIndex || sectionStartedAt !== startSectionStartedAt) {
          await updateDynamoDB(TABLE_PK_MAPPER.MockTestAttempt, inProgress.sk!, { current_section_index: index, section_started_at: sectionStartedAt });
        }
        const updatedAttempt = { ...inProgress, current_section_index: index, section_started_at: sectionStartedAt };
        const canonicalQuestions = await getQuestionsWithAnswers(testSk);
        const sectionQuestions = canonicalQuestions.filter((q) => q.section === test.sections[index]);
        return {
          attempt: updatedAttempt,
          test,
          questions: toPublicShuffled(sectionQuestions, inProgress.sk!),
          sectionTiming: buildSectionTimingInfo(test, index, sectionStartedAt),
        };
      }
      // Every section's time is gone — finalize with whatever was last saved, then fall through to the limit check for a possible new attempt.
      await finalizeAttemptInternal(test, inProgress, inProgress.answers);
      submittedCount += 1;
    } else {
      const elapsedMs = Date.now() - inProgress.started_at;
      const durationMs = test.duration_minutes * 60 * 1000;
      if (elapsedMs < durationMs) {
        const canonicalQuestions = await getQuestionsWithAnswers(testSk);
        return { attempt: inProgress, test, questions: toPublicShuffled(canonicalQuestions, inProgress.sk!) };
      }
      // Time's up while they were away — finalize with whatever was last saved, then fall through to the limit check for a possible new attempt.
      await finalizeAttemptInternal(test, inProgress, inProgress.answers);
      submittedCount += 1;
    }
  }

  const scheduleState = getTestScheduleState(test);
  if (scheduleState === "NOT_YET_OPEN") throw new Error("TEST_NOT_YET_OPEN");
  if (scheduleState === "CLOSED") throw new Error("TEST_CLOSED");

  const effectiveMax = await getEffectiveMaxAttempts(testSk, userSub, test.max_attempts);
  if (submittedCount >= effectiveMax) throw new Error("ATTEMPT_LIMIT_REACHED");

  const now = Date.now();
  const newAttempt: IMockTestAttempt = {
    test_id: testSk,
    series_id: test.series_id,
    user_sub: userSub,
    status: MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS,
    answers: {},
    started_at: now,
    ...(sectionTimingEnabled ? { current_section_index: 0, section_started_at: now } : {}),
  };
  const { sk } = await insertDataDynamoDB(ALL_TABLE_NAMES.MockTestAttempt, newAttempt);
  const canonicalQuestions = await getQuestionsWithAnswers(testSk);
  const attempt = { ...newAttempt, pk: TABLE_PK_MAPPER.MockTestAttempt, sk };

  if (sectionTimingEnabled) {
    const sectionQuestions = canonicalQuestions.filter((q) => q.section === test.sections[0]);
    return { attempt, test, questions: toPublicShuffled(sectionQuestions, sk), sectionTiming: buildSectionTimingInfo(test, 0, now) };
  }
  return { attempt, test, questions: toPublicShuffled(canonicalQuestions, sk) };
}

/**
 * Voluntarily finishes the current section early (before its timer runs
 * out) and moves to the next one — the new section gets its own fresh
 * timer, not a bonus of whatever time was left unused. Only valid for a
 * section-timed, in-progress, non-last section; the caller submits the
 * whole test normally once on the last section instead of calling this.
 */
export async function advanceToNextSection(
  attemptSk: string,
  userSub: string
): Promise<{ attempt: IMockTestAttempt; questions: IPublicMockTestQuestion[]; sectionTiming: ISectionTimingInfo }> {
  const results = await fetchDynamoDB<IMockTestAttempt>(ALL_TABLE_NAMES.MockTestAttempt, attemptSk);
  const attempt = results[0];
  if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
  if (attempt.user_sub !== userSub) throw new Error("FORBIDDEN");
  if (attempt.status !== MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS) throw new Error("ATTEMPT_NOT_IN_PROGRESS");

  const test = await getMockTestBySk(attempt.test_id);
  if (!test) throw new Error("TEST_NOT_FOUND");
  if (!isSectionTimingEnabled(test)) throw new Error("SECTION_TIMING_NOT_ENABLED");

  const currentIndex = attempt.current_section_index ?? 0;
  const nextIndex = currentIndex + 1;
  if (nextIndex >= test.sections.length) throw new Error("ALREADY_LAST_SECTION");

  const sectionStartedAt = Date.now();
  await updateDynamoDB(TABLE_PK_MAPPER.MockTestAttempt, attemptSk, { current_section_index: nextIndex, section_started_at: sectionStartedAt });
  const canonicalQuestions = await getQuestionsWithAnswers(attempt.test_id);
  const sectionQuestions = canonicalQuestions.filter((q) => q.section === test.sections[nextIndex]);
  return {
    attempt: { ...attempt, current_section_index: nextIndex, section_started_at: sectionStartedAt },
    questions: toPublicShuffled(sectionQuestions, attempt.sk!),
    sectionTiming: buildSectionTimingInfo(test, nextIndex, sectionStartedAt),
  };
}

/**
 * Starts a practice attempt — timed the same as a real attempt, but never
 * counts toward max_attempts and never enters another attempt's
 * percentile/rank pool. Can optionally be scoped to a single section; when
 * that section has its own configured duration, the countdown uses that
 * section's own time instead of the whole test's duration. Always allowed
 * (no limit check) as long as the test is published — the scheduled
 * availability window only gates real (non-practice) attempts.
 */
export async function startPracticeAttempt(
  testSk: string,
  userSub: string,
  section?: string
): Promise<{ attempt: IMockTestAttempt; test: IMockTest; questions: IPublicMockTestQuestion[]; sectionTiming?: ISectionTimingInfo }> {
  const test = await getPublishedTest(testSk);
  if (!test) throw new Error("TEST_NOT_FOUND");

  let canonicalQuestions = await getQuestionsWithAnswers(testSk);
  if (section) canonicalQuestions = canonicalQuestions.filter((q) => q.section === section);
  if (canonicalQuestions.length === 0) throw new Error("NO_QUESTIONS_FOR_SECTION");

  const sectionTiming =
    section && test.section_durations?.[section] !== undefined
      ? buildSectionTimingInfo(test, Math.max(0, test.sections.indexOf(section)), 0)
      : undefined;

  // Resume an existing in-progress practice attempt on this exact scope (whole test, or the same
  // section) rather than orphaning it — the same timed session should survive a refresh, same as a real attempt.
  const existing = await getAttemptsForUserAndTest(testSk, userSub);
  const inProgressPractice = existing.find(
    (a) => a.status === MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS && a.is_practice && a.practice_section === section
  );
  if (inProgressPractice) {
    return {
      attempt: inProgressPractice,
      test,
      questions: toPublicShuffled(canonicalQuestions, inProgressPractice.sk!),
      sectionTiming: sectionTiming && { ...sectionTiming, sectionStartedAt: inProgressPractice.started_at },
    };
  }

  const now = Date.now();
  const newAttempt: IMockTestAttempt = {
    test_id: testSk,
    series_id: test.series_id,
    user_sub: userSub,
    status: MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS,
    answers: {},
    started_at: now,
    is_practice: true,
    practice_section: section,
  };
  const { sk } = await insertDataDynamoDB(ALL_TABLE_NAMES.MockTestAttempt, newAttempt);
  return {
    attempt: { ...newAttempt, pk: TABLE_PK_MAPPER.MockTestAttempt, sk },
    test,
    questions: toPublicShuffled(canonicalQuestions, sk),
    sectionTiming: sectionTiming && { ...sectionTiming, sectionStartedAt: now },
  };
}

/** Autosave — called on every answer/mark-for-review/time change while the test is in progress, so a refresh/crash never loses progress. */
export async function saveAttemptProgress(
  attemptSk: string,
  userSub: string,
  answers: Record<string, 0 | 1 | 2 | 3>,
  markedForReview?: string[],
  timePerQuestion?: Record<string, number>
): Promise<void> {
  const results = await fetchDynamoDB<IMockTestAttempt>(ALL_TABLE_NAMES.MockTestAttempt, attemptSk);
  const attempt = results[0];
  if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
  if (attempt.user_sub !== userSub) throw new Error("FORBIDDEN");
  if (attempt.status !== MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS) return; // already submitted — a late/racing autosave is a harmless no-op
  const updates: Record<string, any> = { answers };
  if (markedForReview !== undefined) updates.marked_for_review = markedForReview;
  if (timePerQuestion !== undefined) updates.time_per_question = timePerQuestion;
  await updateDynamoDB(TABLE_PK_MAPPER.MockTestAttempt, attemptSk, updates);
}

/** The user-initiated final submit — freezes the given answers (the client's last-known state, which may be a moment ahead of the last autosave) and scores the attempt. */
export async function finalizeAttempt(
  attemptSk: string,
  userSub: string,
  finalAnswers: Record<string, 0 | 1 | 2 | 3>,
  finalMarkedForReview?: string[],
  finalTimePerQuestion?: Record<string, number>
): Promise<IMockTestAttempt> {
  try {
    const results = await fetchDynamoDB<IMockTestAttempt>(ALL_TABLE_NAMES.MockTestAttempt, attemptSk);
    const attempt = results[0];
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    if (attempt.user_sub !== userSub) throw new Error("FORBIDDEN");
    if (attempt.status !== MOCK_TEST_ATTEMPT_STATUS.IN_PROGRESS) return attempt; // already submitted — idempotent

    const test = await getMockTestBySk(attempt.test_id);
    if (!test) throw new Error("TEST_NOT_FOUND");
    return await finalizeAttemptInternal(test, attempt, finalAnswers, finalMarkedForReview, finalTimePerQuestion);
  } catch (error) {
    logErrorLocation("mockTestService.ts", "finalizeAttempt", error, "Error finalizing mock test attempt", "", { attemptSk, userSub });
    throw error;
  }
}

export interface IMyAttemptsForTest {
  attempts: IMockTestAttempt[];
  maxAttempts: number;
  attemptsUsed: number;
  scheduleState: TestScheduleState;
}

/** Powers the "attempts used: X / Y" display and per-test attempt history on the instructions/series page. */
export async function listMyAttemptsForTest(testSk: string, userSub: string): Promise<IMyAttemptsForTest> {
  const test = await getPublishedTest(testSk);
  if (!test) throw new Error("TEST_NOT_FOUND");
  const attempts = await getAttemptsForUserAndTest(testSk, userSub);
  const maxAttempts = await getEffectiveMaxAttempts(testSk, userSub, test.max_attempts);
  const attemptsUsed = attempts.filter((a) => a.status === MOCK_TEST_ATTEMPT_STATUS.SUBMITTED && !a.is_practice).length;
  return {
    attempts: attempts.sort((a, b) => b.started_at - a.started_at),
    maxAttempts,
    attemptsUsed,
    scheduleState: getTestScheduleState(test),
  };
}

/** Full scan of the MockTestAttempt partition, filtered in memory — fine at V1 volume, same tradeoff as Contact's trash listing. */
export async function getMyAttempts(userSub: string): Promise<IMockTestAttempt[]> {
  const all = await fetchDynamoDB<IMockTestAttempt>(ALL_TABLE_NAMES.MockTestAttempt, undefined, ["*"]);
  return all.filter((a) => a.user_sub === userSub).sort((a, b) => b.started_at - a.started_at);
}

export async function getAttemptResult(attemptSk: string, userSub: string): Promise<IMockTestAttempt | null> {
  const results = await fetchDynamoDB<IMockTestAttempt>(ALL_TABLE_NAMES.MockTestAttempt, attemptSk);
  const attempt = results[0];
  if (!attempt) return null;
  if (attempt.user_sub !== userSub) throw new Error("FORBIDDEN");
  return attempt;
}

/**
 * Post-submission answer review — every question in the exact shuffled
 * order/options the student actually saw, with the correct answer,
 * explanation, their own given answer, and time spent, all translated back
 * from canonical using that attempt's own seed. Never available before
 * submission (the whole point of stripping correct_option_index/explanation
 * from the pre-submit payload).
 */
export async function getAttemptReview(attemptSk: string, userSub: string): Promise<IAttemptReviewQuestion[]> {
  const results = await fetchDynamoDB<IMockTestAttempt>(ALL_TABLE_NAMES.MockTestAttempt, attemptSk);
  const attempt = results[0];
  if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
  if (attempt.user_sub !== userSub) throw new Error("FORBIDDEN");
  if (attempt.status !== MOCK_TEST_ATTEMPT_STATUS.SUBMITTED) throw new Error("ATTEMPT_NOT_SUBMITTED");

  const questions = await getQuestionsWithAnswers(attempt.test_id);
  const seed = attempt.sk!;
  const ordered = questionOrderFor(questions, seed);

  return ordered.map((q) => {
    const perm = optionPermutationFor(seed, q.sk!);
    const options_en = perm.map((i) => q.options_en[i]) as [string, string, string, string];
    const options_hi = q.options_hi ? (perm.map((i) => q.options_hi![i]) as [string, string, string, string]) : undefined;
    const correctDisplayedIndex = perm.indexOf(q.correct_option_index);
    const givenDisplayedIndex = attempt.answers[q.sk!];
    return {
      sk: q.sk!,
      section: q.section,
      question_en: q.question_en,
      question_hi: q.question_hi,
      options_en,
      options_hi,
      given_answer_index: givenDisplayedIndex,
      correct_answer_index: correctDisplayedIndex,
      is_correct: givenDisplayedIndex !== undefined && givenDisplayedIndex === correctDisplayedIndex,
      explanation_en: q.explanation_en,
      explanation_hi: q.explanation_hi,
      time_spent_seconds: attempt.time_per_question?.[q.sk!] ?? 0,
    };
  });
}

/**
 * A student hitting their attempt limit can ask an admin to raise it just
 * for them. Enforced server-side (not just by hiding the button) — a
 * student with attempts still remaining can't file a request. Reuses any
 * still-PENDING request rather than piling up duplicates if they click the
 * button twice.
 */
export async function requestMoreAttempts(
  testSk: string,
  userSub: string,
  userName: string | undefined,
  userEmail: string | undefined,
  reason: string | undefined
): Promise<IMockTestAttemptRequest> {
  const test = await getPublishedTest(testSk);
  if (!test) throw new Error("TEST_NOT_FOUND");
  const attempts = await getAttemptsForUserAndTest(testSk, userSub);
  const attemptsUsed = attempts.filter((a) => a.status === MOCK_TEST_ATTEMPT_STATUS.SUBMITTED && !a.is_practice).length;
  const effectiveMax = await getEffectiveMaxAttempts(testSk, userSub, test.max_attempts);
  if (attemptsUsed < effectiveMax) throw new Error("ATTEMPTS_NOT_YET_EXHAUSTED");

  const existing = await fetchDynamoDB<IMockTestAttemptRequest>(
    ALL_TABLE_NAMES.MockTestAttemptRequest,
    undefined,
    ["*"],
    { test_id: testSk, user_sub: userSub },
    "#test_id = :test_id and #user_sub = :user_sub"
  );
  const pending = existing.find((r) => r.status === MOCK_TEST_ATTEMPT_REQUEST_STATUS.PENDING);
  if (pending) return pending;

  const request: IMockTestAttemptRequest = {
    test_id: testSk,
    user_sub: userSub,
    user_name: userName,
    user_email: userEmail,
    status: MOCK_TEST_ATTEMPT_REQUEST_STATUS.PENDING,
    reason,
  };
  const { sk } = await insertDataDynamoDB(ALL_TABLE_NAMES.MockTestAttemptRequest, request);
  return { ...request, pk: TABLE_PK_MAPPER.MockTestAttemptRequest, sk };
}
