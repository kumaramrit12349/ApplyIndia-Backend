export const GUIDANCE_SLOT = {
  /* keys */
  pk: "pk",
  sk: "sk",

  notification_id: "notification_id",
  start_time: "start_time",
  end_time: "end_time",
  meet_link: "meet_link",
  status: "status",
  notes: "notes",
  cancel_reason: "cancel_reason",
  cancelled_at: "cancelled_at",
  booking_sk: "booking_sk",

  created_by: "created_by",
  created_at: "created_at",
  modified_at: "modified_at",
} as const;

/** 15-minute guidance session duration, per the V1 product spec. */
export const GUIDANCE_SLOT_DURATION_MS = 15 * 60 * 1000;

export enum GUIDANCE_SLOT_STATUS {
  AVAILABLE = "available",
  UNAVAILABLE = "unavailable",
  BOOKED = "booked",
  CANCELLED = "cancelled",
  COMPLETED = "completed",
}
