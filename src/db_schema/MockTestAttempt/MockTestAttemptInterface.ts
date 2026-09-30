import { MOCK_TEST_ATTEMPT_STATUS } from "./MockTestAttemptConstant";

export interface IMockTestSectionBreakdown {
  correct: number;
  total: number;
  score: number;
}

export interface IMockTestAttempt {
  /* Keys */
  pk?: string;
  sk?: string;

  test_id: string;
  series_id: string;
  user_sub: string;
  status: MOCK_TEST_ATTEMPT_STATUS;

  /** question sk -> selected option index (0-3); unanswered questions are simply absent. Autosaved while in_progress. */
  answers: Record<string, 0 | 1 | 2 | 3>;
  marked_for_review?: string[];
  time_per_question?: Record<string, number>;
  /** Only present once status is SUBMITTED. */
  score?: number;
  total_marks?: number;
  section_breakdown?: Record<string, IMockTestSectionBreakdown>;
  percentile?: number;
  rank?: number;
  total_participants?: number;
  top_score?: number;

  is_practice?: boolean;
  practice_section?: string;

  current_section_index?: number;
  section_started_at?: number;

  started_at: number;
  /** Only present once status is SUBMITTED. */
  submitted_at?: number;

  created_at?: number;
  modified_at?: number;
}
