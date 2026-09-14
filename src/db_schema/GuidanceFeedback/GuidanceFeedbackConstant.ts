export const GUIDANCE_FEEDBACK = {
  /* keys */
  pk: "pk",
  sk: "sk",

  booking_sk: "booking_sk",
  notification_id: "notification_id",
  user_sub: "user_sub",
  rating: "rating",
  problem_solved: "problem_solved",
  topic_tags: "topic_tags",
  message: "message",
  consent_public: "consent_public",
  display_name: "display_name",
  moderation_status: "moderation_status",
  featured: "featured",

  moderated_by: "moderated_by",
  moderated_at: "moderated_at",
  created_at: "created_at",
} as const;

export enum GUIDANCE_PROBLEM_SOLVED {
  YES = "yes",
  NO = "no",
  PARTIALLY = "partially",
}

export enum GUIDANCE_MODERATION_STATUS {
  PENDING = "pending",
  PUBLISHED = "published",
  HIDDEN = "hidden",
}

/** Fixed topic-tag list surfaced in the feedback form and admin filters. */
export const GUIDANCE_TOPIC_TAGS = [
  "registration",
  "form_filling",
  "photo_signature",
  "document_upload",
  "payment",
  "technical_issue",
  "field_understanding",
  "other",
] as const;

export type GuidanceTopicTag = (typeof GUIDANCE_TOPIC_TAGS)[number];
