import { MOCK_TEST_ATTEMPT_REQUEST_STATUS } from "./MockTestAttemptRequestConstant";

export interface IMockTestAttemptRequest {
  /* Keys */
  pk?: string;
  sk?: string;

  test_id: string;
  user_sub: string;
  user_name?: string;
  user_email?: string;
  status: MOCK_TEST_ATTEMPT_REQUEST_STATUS;
  reason?: string;
  granted_max_attempts?: number;

  resolved_at?: number;

  created_at?: number;
  modified_at?: number;
}
