export const GUIDANCE_BOOKING = {
  /* keys */
  pk: "pk",
  sk: "sk",

  notification_id: "notification_id",
  notification_title: "notification_title",
  slot_sk: "slot_sk",
  slot_created_by: "slot_created_by",
  slot_start_time: "slot_start_time",
  slot_end_time: "slot_end_time",
  meet_link: "meet_link",
  user_sub: "user_sub",
  user_name: "user_name",
  user_email: "user_email",
  status: "status",
  issue_note: "issue_note",
  admin_notes: "admin_notes",
  cancel_reason: "cancel_reason",

  booked_at: "booked_at",
  cancelled_at: "cancelled_at",
  completed_at: "completed_at",
} as const;

export enum GUIDANCE_BOOKING_STATUS {
  UPCOMING = "upcoming",
  COMPLETED = "completed",
  NO_SHOW = "no_show",
  CANCELLED_BY_USER = "cancelled_by_user",
  CANCELLED_BY_ADMIN = "cancelled_by_admin",
}

/**
 * Statuses that count toward a user's 3-booking allowance for a notification.
 * A user-initiated cancellation still consumes one of the 3 (discourages
 * casual cancel-and-rebook cycling through slots); an admin-initiated
 * cancellation does NOT (the user didn't cause it, so it shouldn't cost them).
 */
export const GUIDANCE_BOOKING_STATUSES_COUNTED_TOWARD_LIMIT: GUIDANCE_BOOKING_STATUS[] = [
  GUIDANCE_BOOKING_STATUS.UPCOMING,
  GUIDANCE_BOOKING_STATUS.COMPLETED,
  GUIDANCE_BOOKING_STATUS.NO_SHOW,
  GUIDANCE_BOOKING_STATUS.CANCELLED_BY_USER,
];

export const MAX_GUIDANCE_BOOKINGS_PER_NOTIFICATION = 3;

/** Users may not cancel a booking within this window of its start time. */
export const GUIDANCE_CANCEL_CUTOFF_MS = 60 * 60 * 1000; // 1 hour
