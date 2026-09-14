import { GUIDANCE_MODERATION_STATUS, GUIDANCE_PROBLEM_SOLVED, GuidanceTopicTag } from "./GuidanceFeedbackConstant";

export interface IGuidanceFeedback {
  /* Keys */
  pk?: string;
  sk?: string;

  booking_sk: string;
  notification_id: string;
  user_sub: string;

  rating: number; // 1-5
  problem_solved: GUIDANCE_PROBLEM_SOLVED;
  topic_tags: GuidanceTopicTag[];
  message?: string;

  /** Opt-in consent captured verbatim at submission time. */
  consent_public: boolean;
  /** Admin-editable public-facing name (e.g. "Rahul S."), set before publishing. */
  display_name?: string;

  moderation_status: GUIDANCE_MODERATION_STATUS;
  featured: boolean;
  moderated_by?: string;
  moderated_at?: number;

  created_at: number;
}
