export const MOCK_TEST_ATTEMPT_REQUEST = {
  pk: "pk",
  sk: "sk",

  test_id: "test_id",
  user_sub: "user_sub",
  /** Denormalized at request time so the admin list doesn't need a per-row user lookup. */
  user_name: "user_name",
  user_email: "user_email",
  status: "status",
  /** Student's free-text note on why they need more attempts — optional. */
  reason: "reason",
  /** Set by the admin on approval — the new effective cap for this student on this test only. */
  granted_max_attempts: "granted_max_attempts",

  resolved_at: "resolved_at",
} as const;

export enum MOCK_TEST_ATTEMPT_REQUEST_STATUS {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}
