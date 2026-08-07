export type ChannelStatus = "pending" | "sent" | "failed" | "skipped";

export interface IChannelResult {
  status: ChannelStatus;
  sent_count?: number;
  failed_count?: number;
  /** Eligible users with no email/phone on file — counted, not silently dropped. */
  skipped_count?: number;
  /**
   * Eligible-user count computed once during fan-out enumeration; the target
   * sent_count+failed_count+skipped_count converges to before status flips
   * from "pending" to a final value. Absent while enumeration is still running.
   */
  total_count?: number;
  last_attempt_at?: number;
  error?: string;
}

/**
 * Notification#<id>#DISTRIBUTION — tracks per-channel delivery status for a
 * single notification. Written/updated via updateDynamoDB (upsert), so it
 * doesn't need a separate "create" step.
 */
export interface IDistributionLog {
  pk?: string;
  sk?: string;
  email?: IChannelResult;
}
