export const SOCIAL_POST = {
  pk: "pk",
  sk: "sk",
  notification_id: "notification_id",
  platform: "platform",
  status: "status",
  content: "content",
  external_post_id: "external_post_id",
  error_message: "error_message",
  retry_count: "retry_count",
  published_at: "published_at",
  created_at: "created_at",
  modified_at: "modified_at",
};

// Fixed platform identifiers — add one per social channel as new integrations are introduced.
export const SOCIAL_PLATFORM = {
  TELEGRAM: "telegram",
} as const;

/** sk = SocialPost#<notification_id>#<platform> — the composite key itself is the idempotency guard. */
export function getSocialPostSk(notificationId: string, platform: string): string {
  return `SocialPost#${notificationId}#${platform}`;
}
