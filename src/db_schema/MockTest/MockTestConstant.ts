export const MOCK_TEST = {
  pk: "pk",
  sk: "sk",

  /** Discriminates a main Test item from a QUESTION sub-item sharing the same MockTest# partition. */
  type: "type",
  series_id: "series_id",

  title_en: "title_en",
  title_hi: "title_hi",
  duration_minutes: "duration_minutes",
  marks_per_correct: "marks_per_correct",
  negative_marks_per_wrong: "negative_marks_per_wrong",
  /** Section tags this test covers — drives the score breakdown, and optionally per-section timing below. */
  sections: "sections",
  /** Optional: section name -> minutes. When set (non-empty), the test runs in section-locked mode — each section gets its own countdown, auto-advances to the next on expiry, and a student can't switch back to a finished section. Absent = one whole-test timer only (the default). */
  section_durations: "section_durations",
  is_published: "is_published",
  /** Default per-student attempt cap; a student can be granted more via an approved MockTestAttemptRequest. */
  max_attempts: "max_attempts",
  /** Optional scheduled availability window layered on top of is_published — either/both may be omitted. */
  available_from: "available_from",
  available_to: "available_to",

  /* Question-only fields (present when type = QUESTION) */
  question_en: "question_en",
  question_hi: "question_hi",
  options_en: "options_en",
  options_hi: "options_hi",
  correct_option_index: "correct_option_index",
  section: "section",
  order: "order",
  /** Optional "why" shown on the post-submission answer review — never sent before a test is submitted. */
  explanation_en: "explanation_en",
  explanation_hi: "explanation_hi",
} as const;

export enum MOCK_TEST_ITEM_TYPE {
  TEST = "test",
  QUESTION = "question",
}

/** sk infix for the question sub-item kind — used to build/scope its composed sk (`MockTest#<testId>#QUESTION#<id>`). */
export const MOCK_TEST_SUB_ITEM_TYPE = {
  QUESTION: "QUESTION",
} as const;
