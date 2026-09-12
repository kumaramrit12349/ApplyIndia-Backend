import { GUIDANCE_BOOKING_STATUS } from "./GuidanceBookingConstant";

export interface IGuidanceBooking {
  /* Keys */
  pk?: string;
  sk?: string;

  notification_id: string;
  /** Denormalized at booking time so booking lists don't need a join. */
  notification_title: string;
  slot_sk: string;
  slot_start_time: number;
  slot_end_time: number;
  meet_link: string;
  user_sub: string;
  user_name?: string;
  user_email: string;
  status: GUIDANCE_BOOKING_STATUS;

  /** Optional free text the user enters at booking time — what they're stuck on. */
  issue_note?: string;
  /** Admin's post-session notes, also doubles as a lightweight "report an issue" record. */
  admin_notes?: string;
  /** Reason shown to the user when an admin cancels their booking. */
  cancel_reason?: string;

  booked_at: number;
  cancelled_at?: number;
  completed_at?: number;
}
