import { MOCK_TEST_ITEM_TYPE } from "./MockTestConstant";

export interface IMockTest {
  /* Keys */
  pk?: string;
  sk?: string;

  type: MOCK_TEST_ITEM_TYPE.TEST;
  series_id: string;

  title_en: string;
  title_hi?: string;
  duration_minutes: number;
  marks_per_correct: number;
  negative_marks_per_wrong: number;
  sections: string[];
  /** Optional per-section time limits (minutes) — see MOCK_TEST.section_durations for the full behavior this enables. */
  section_durations?: Record<string, number>;
  is_published: boolean;
  max_attempts: number;
  /** Epoch ms — the test is only startable within [available_from, available_to] when either is set, even if is_published is true. */
  available_from?: number;
  available_to?: number;

  created_at?: number;
  modified_at?: number;
}

export interface IMockTestQuestion {
  /* Keys */
  pk?: string;
  /** Composed as `MockTest#<testId>#QUESTION#<id>` — shares the parent test's own partition. */
  sk?: string;

  type: MOCK_TEST_ITEM_TYPE.QUESTION;

  question_en: string;
  question_hi?: string;
  options_en: [string, string, string, string];
  options_hi?: [string, string, string, string];
  correct_option_index: 0 | 1 | 2 | 3;
  /** Must match one of the owning MockTest's `sections`. */
  section: string;
  /** Display order within the test. */
  order: number;
  /** Shown only on the post-submission answer review, never before. */
  explanation_en?: string;
  explanation_hi?: string;

  created_at?: number;
  modified_at?: number;
}
