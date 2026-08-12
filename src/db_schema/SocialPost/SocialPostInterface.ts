export type SocialPostStatus = "pending" | "published" | "failed";

export interface ISocialPost {
  pk?: string;
  sk?: string;
  notification_id: string;
  platform: string; // SOCIAL_PLATFORM value
  status: SocialPostStatus;
  content: string; // exact text posted, for audit/debugging
  external_post_id?: string; // Telegram message_id once published
  error_message?: string;
  retry_count: number;
  published_at?: number;
  created_at?: number;
  modified_at?: number;
}
