import { GUIDANCE_SLOT_STATUS } from "./GuidanceSlotConstant";

export interface IGuidanceSlot {
  /* Keys */
  pk?: string;
  sk?: string;

  notification_id: string;
  start_time: number;
  end_time: number;
  meet_link: string;
  status: GUIDANCE_SLOT_STATUS;
  notes?: string;
  cancel_reason?: string;
  cancelled_at?: number;
  /** Set while status === BOOKED — sk of the active GuidanceBooking. */
  booking_sk?: string;

  created_by: string;
  created_at: number;
  modified_at: number;
}
