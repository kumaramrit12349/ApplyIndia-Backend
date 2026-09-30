import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { MOCK_TEST_ITEM_TYPE, MOCK_TEST_SUB_ITEM_TYPE } from "../../db_schema/MockTest/MockTestConstant";
import { IMockTest, IMockTestQuestion } from "../../db_schema/MockTest/MockTestInterface";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { logErrorLocation } from "../../utils/errorUtils";
import { IParsedMockTestQuestion } from "../../utils/mockTestPdfParser";
import { IMockTestAttemptRequest } from "../../db_schema/MockTestAttemptRequest/MockTestAttemptRequestInterface";
import { MOCK_TEST_ATTEMPT_REQUEST_STATUS } from "../../db_schema/MockTestAttemptRequest/MockTestAttemptRequestConstant";

/**
 * sk prefix for a Question sub-item under one test — mirrors Contact's
 * NOTE/REPLY convention. Uses the test's bare ulid (stripping "MockTest#")
 * since `pk` already establishes the partition; the prefix still needs the
 * parent id so listing one test's questions is a cheap begins_with query
 * against this test's own range, not a scan of every test's questions.
 */
export function questionSkPrefix(testSk: string): string {
  const bareId = testSk.slice(TABLE_PK_MAPPER.MockTest.length);
  return `${bareId}#${MOCK_TEST_SUB_ITEM_TYPE.QUESTION}#`;
}

export async function createMockTest(
  input: Omit<IMockTest, "pk" | "sk" | "type">
): Promise<IMockTest> {
  const item: IMockTest = { ...input, type: MOCK_TEST_ITEM_TYPE.TEST };
  const { sk } = await insertDataDynamoDB(ALL_TABLE_NAMES.MockTest, item);
  return { ...item, pk: TABLE_PK_MAPPER.MockTest, sk };
}

export async function updateMockTest(sk: string, updates: Partial<IMockTest>): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.MockTest, sk, updates);
}

export async function publishMockTest(sk: string, isPublished: boolean): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.MockTest, sk, { is_published: isPublished });
}

export async function getMockTestBySk(sk: string): Promise<IMockTest | null> {
  const results = await fetchDynamoDB<IMockTest>(ALL_TABLE_NAMES.MockTest, sk);
  const item = results[0];
  return item && item.type === MOCK_TEST_ITEM_TYPE.TEST ? item : null;
}

/**
 * Full scan of the shared MockTest# partition, filtered in memory — fine at
 * V1 volume (a handful of exams x tests), same tradeoff already accepted
 * throughout this codebase (e.g. Contact's trash listing).
 */
export async function listMockTestsBySeries(seriesId: string): Promise<IMockTest[]> {
  const all = await fetchDynamoDB<IMockTest>(ALL_TABLE_NAMES.MockTest, undefined, ["*"]);
  return all.filter((t) => t.type === MOCK_TEST_ITEM_TYPE.TEST && t.series_id === seriesId);
}

export async function addQuestion(
  testSk: string,
  input: Omit<IMockTestQuestion, "pk" | "sk" | "type">
): Promise<IMockTestQuestion> {
  const question: IMockTestQuestion = {
    ...input,
    pk: TABLE_PK_MAPPER.MockTest,
    sk: `${questionSkPrefix(testSk)}${ulid()}`,
    type: MOCK_TEST_ITEM_TYPE.QUESTION,
  };
  await insertDataDynamoDB(ALL_TABLE_NAMES.MockTest, question);
  return question;
}

/** Inserts every reviewed question from a PDF/DOC import in one go, preserving display order. */
export async function bulkAddQuestions(
  testSk: string,
  parsed: IParsedMockTestQuestion[],
  startOrder: number
): Promise<IMockTestQuestion[]> {
  return Promise.all(
    parsed.map((q, i) =>
      addQuestion(testSk, {
        question_en: q.question_en,
        question_hi: q.question_hi,
        options_en: q.options_en,
        options_hi: q.options_hi,
        correct_option_index: q.correct_option_index,
        section: q.section,
        order: startOrder + i,
        explanation_en: q.explanation_en,
        explanation_hi: q.explanation_hi,
      })
    )
  );
}

export async function updateQuestion(questionSk: string, updates: Partial<IMockTestQuestion>): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.MockTest, questionSk, updates);
}

export async function deleteQuestion(questionSk: string): Promise<void> {
  await deleteDynamoDB(TABLE_PK_MAPPER.MockTest, questionSk);
}

/** Admin-side question list — includes `correct_option_index`, unlike the public "take test" view. */
export async function listQuestionsForAdmin(testSk: string): Promise<IMockTestQuestion[]> {
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

export interface ISectionRange {
  /** 1-indexed, inclusive — position in the test's current display order, not a DB offset. */
  from: number;
  to: number;
  section: string;
}

/**
 * Re-tags every question's `section` in one shot from position ranges (e.g.
 * "1-30 -> Hindi, 31-70 -> Maths, 71-150 -> GK") instead of setting each
 * question's section one at a time. Also replaces the parent test's own
 * `sections` list with the given ranges' labels, in the order supplied, so
 * they immediately show up in the one-at-a-time authoring form's section
 * dropdown and in the score breakdown. Ranges are applied against the test's
 * existing display order (`order` field) — a question outside every given
 * range keeps whatever section it already had.
 */
export async function bulkAssignSections(testSk: string, ranges: ISectionRange[]): Promise<void> {
  try {
    const questions = await listQuestionsForAdmin(testSk);
    const updates: Promise<void>[] = [];
    for (const range of ranges) {
      const slice = questions.slice(Math.max(0, range.from - 1), range.to);
      for (const q of slice) {
        if (q.section !== range.section) updates.push(updateQuestion(q.sk!, { section: range.section }));
      }
    }
    await Promise.all(updates);
    await updateMockTest(testSk, { sections: ranges.map((r) => r.section) });
  } catch (error) {
    logErrorLocation("mockTestAdminService.ts", "bulkAssignSections", error, "Error bulk-assigning sections", "", { testSk, ranges });
    throw error;
  }
}

/**
 * Admin-only "how will this look to an aspirant" preview — same shape as the
 * public getTestForTaking (correct_option_index stripped, so the preview is
 * an honest simulation of what a user would actually see, not an answer-key
 * view), but deliberately skips the is_published gate so a test can be
 * previewed before it ever goes live.
 */
export async function getTestForPreview(
  testSk: string
): Promise<{ test: IMockTest; questions: Omit<IMockTestQuestion, "correct_option_index" | "type" | "explanation_en" | "explanation_hi">[] } | null> {
  const test = await getMockTestBySk(testSk);
  if (!test) return null;
  const questions = await listQuestionsForAdmin(testSk);
  // Mirrors exactly what an aspirant sees pre-submission — explanations only ever appear on the post-submit review.
  return { test, questions: questions.map(({ correct_option_index, type, explanation_en, explanation_hi, ...rest }) => rest) };
}

/**
 * Full scan of the MockTestAttemptRequest partition, filtered in memory —
 * fine at this feature's expected volume (a handful of requests per test,
 * not thousands), same tradeoff as Contact's trash listing.
 */
export async function listAttemptRequestsForAdmin(testSk: string): Promise<IMockTestAttemptRequest[]> {
  const all = await fetchDynamoDB<IMockTestAttemptRequest>(ALL_TABLE_NAMES.MockTestAttemptRequest, undefined, ["*"]);
  return all.filter((r) => r.test_id === testSk).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

export async function approveAttemptRequest(requestSk: string, grantedMaxAttempts: number): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.MockTestAttemptRequest, requestSk, {
    status: MOCK_TEST_ATTEMPT_REQUEST_STATUS.APPROVED,
    granted_max_attempts: grantedMaxAttempts,
    resolved_at: Date.now(),
  });
}

export async function rejectAttemptRequest(requestSk: string): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.MockTestAttemptRequest, requestSk, {
    status: MOCK_TEST_ATTEMPT_REQUEST_STATUS.REJECTED,
    resolved_at: Date.now(),
  });
}

/**
 * Removes every Question sub-item under this test plus the test row itself
 * — otherwise the questions would be orphaned under a test_id that no
 * longer resolves (mirrors permanentlyDeleteContact's parent-plus-sub-items
 * cascade in contactAdminService.ts).
 */
export async function deleteMockTestCascade(testSk: string): Promise<void> {
  try {
    const questions = await listQuestionsForAdmin(testSk);
    await Promise.all([
      deleteDynamoDB(TABLE_PK_MAPPER.MockTest, testSk),
      ...questions.map((q) => deleteDynamoDB(TABLE_PK_MAPPER.MockTest, q.sk!)),
    ]);
  } catch (error) {
    logErrorLocation("mockTestAdminService.ts", "deleteMockTestCascade", error, "Error deleting mock test", "", { testSk });
    throw error;
  }
}
