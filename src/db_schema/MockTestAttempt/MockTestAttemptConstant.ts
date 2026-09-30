export const MOCK_TEST_ATTEMPT = {
  pk: "pk",
  sk: "sk",

  test_id: "test_id",
  /** Denormalized at attempt time so an attempt list doesn't need a join back to the series. */
  series_id: "series_id",
  user_sub: "user_sub",
  status: "status",

  /** Map of question sk -> selected option index (0-3). Written incrementally (autosaved) while in_progress, frozen at submit. */
  answers: "answers",
  /** Question sks the student flagged "come back to this" — autosaved alongside answers, independent of whether it's answered. */
  marked_for_review: "marked_for_review",
  /** Map of question sk -> seconds spent viewing it — wall-clock deltas between navigation events, autosaved. */
  time_per_question: "time_per_question",
  score: "score",
  total_marks: "total_marks",
  /** Map of section tag -> { correct, total, score }. */
  section_breakdown: "section_breakdown",
  /** % of other SUBMITTED, non-practice attempts on this same test_id that scored lower — computed once at submit time, not live. */
  percentile: "percentile",
  /** 1 = top scorer. Computed once at submit time, alongside percentile. */
  rank: "rank",
  total_participants: "total_participants",
  top_score: "top_score",
  /** A practice attempt never counts toward max_attempts and never enters another attempt's percentile/rank pool. */
  is_practice: "is_practice",
  /** Set only when a practice attempt was scoped to a single section. */
  practice_section: "practice_section",

  /** Only meaningful when the test has section_durations set. Index into the test's own `sections` array — the only section this attempt may currently see/answer. */
  current_section_index: "current_section_index",
  /** Epoch ms the current section began — resets every time the section advances (by timeout or early manual finish). */
  section_started_at: "section_started_at",

  started_at: "started_at",
  submitted_at: "submitted_at",
} as const;

/**
 * An attempt is created the moment a student clicks Start (not at submit) so
 * it counts toward their attempt limit immediately and so refreshing the
 * page resumes the same timed session instead of granting a free extra try.
 */
export enum MOCK_TEST_ATTEMPT_STATUS {
  IN_PROGRESS = "in_progress",
  SUBMITTED = "submitted",
}
