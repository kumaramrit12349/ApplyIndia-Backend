export const PLATFORM_SETTINGS = {
  pk: "pk",
  sk: "sk",
  /** Master switch — off means nothing sends, regardless of any channel flag below. */
  email_communication_enabled: "email_communication_enabled",
  contact_us_enabled: "contact_us_enabled",
  guidance_enabled: "guidance_enabled",
  notification_enabled: "notification_enabled",
  created_at: "created_at",
  modified_at: "modified_at",
} as const;

/**
 * This settings row is a singleton (one fixed pk/sk, not a per-record
 * ulid/business key like every other entity in this schema) — there is
 * exactly one platform-wide settings item, so its sk is a hardcoded literal
 * rather than something derived at write time.
 */
export const PLATFORM_SETTINGS_SK = "PlatformSettings#GLOBAL";

/**
 * One value per distinct feature area that calls sendEmail() — every call
 * site is required to declare which of these it belongs to (see
 * emailService.ts's sendEmail signature), so a new email call site can't
 * silently skip being gated by forgetting to check a flag.
 */
export enum EMAIL_CHANNEL {
  CONTACT_US = "contact_us",
  GUIDANCE = "guidance",
  NOTIFICATION = "notification",
}
