export interface IPlatformSettings {
  pk?: string;
  sk?: string;
  /** Master switch for every outgoing email — off means nothing sends regardless of the channel flags below. Defaults to true when this row doesn't exist yet. */
  email_communication_enabled: boolean;
  /** Contact Us — both the submitter's confirmation and the internal new-submission alert. */
  contact_us_enabled: boolean;
  /** Guidance booking confirmations and slot-related emails. */
  guidance_enabled: boolean;
  /** Job/exam notification alert fan-out. */
  notification_enabled: boolean;
  created_at?: number;
  modified_at?: number;
}
