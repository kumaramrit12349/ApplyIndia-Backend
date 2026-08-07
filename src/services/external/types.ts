export interface IExternalSendResult {
  success: boolean;
  /** True if the call was never attempted because the service isn't configured. */
  skipped?: boolean;
  /** Provider-assigned id (SES MessageId, Twilio Sid, Telegram message_id, FB post id). */
  id?: string;
  error?: string;
}
