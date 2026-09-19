import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import {
  GUIDANCE_SLOT,
  GUIDANCE_SLOT_DURATION_MS,
  GUIDANCE_SLOT_STATUS,
} from "../../db_schema/GuidanceSlot/GuidanceSlotConstant";
import { IGuidanceSlot } from "../../db_schema/GuidanceSlot/GuidanceSlotInterface";
import {
  GUIDANCE_BOOKING,
  GUIDANCE_BOOKING_STATUS,
} from "../../db_schema/GuidanceBooking/GuidanceBookingConstant";
import { IGuidanceBooking } from "../../db_schema/GuidanceBooking/GuidanceBookingInterface";
import { fetchDynamoDB, fetchDynamoDBWithLimit } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { sendEmail } from "../external/emailService";
import { logErrorLocation } from "../../utils/errorUtils";
import { getNotificationById } from "./notificationService";
import { renderEmailTemplate } from "./emailTemplateService";
import { EMAIL_TEMPLATE_KEYS } from "../../db_schema/EmailTemplate/EmailTemplateConstant";
import { EMAIL_CHANNEL } from "../../db_schema/PlatformSettings/PlatformSettingsConstant";
import { buildNotificationUrl } from "./notificationDistributionService";
import { APP_TIME_ZONE } from "../../config/env";
import { upperAmPm } from "../../utils/dateUtils";

const URL_REGEX = /^https?:\/\/.+/i;

async function sendAdminCancellationEmail(booking: IGuidanceBooking, startTime: number, reason?: string): Promise<void> {
  const rendered = await renderEmailTemplate(EMAIL_TEMPLATE_KEYS.GUIDANCE_SLOT_CANCELLED, {
    user_name: booking.user_name || "there",
    notification_title: booking.notification_title,
    date: new Date(startTime).toLocaleDateString("en-IN", { timeZone: APP_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: upperAmPm(new Date(startTime).toLocaleTimeString("en-IN", { timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit" })),
    reason: reason || "an unforeseen scheduling conflict",
    reschedule_url: buildNotificationUrl(booking.notification_title, booking.notification_id),
  });
  if (!rendered) {
    logErrorLocation(
      "guidanceSlotService.ts",
      "sendAdminCancellationEmail",
      new Error("Template not found"),
      `No email template configured for key '${EMAIL_TEMPLATE_KEYS.GUIDANCE_SLOT_CANCELLED}'`,
      "",
      { bookingSk: booking.sk }
    );
    return;
  }
  await sendEmail(booking.user_email, rendered.subject, rendered.html, EMAIL_CHANNEL.GUIDANCE);
}

async function getSlotBySk(slotSk: string): Promise<IGuidanceSlot | null> {
  const results = await fetchDynamoDB<IGuidanceSlot>(ALL_TABLE_NAMES.GuidanceSlot, slotSk);
  return results[0] || null;
}

async function getActiveBookingForSlot(slotSk: string): Promise<IGuidanceBooking | null> {
  const results = await fetchDynamoDB<IGuidanceBooking>(
    ALL_TABLE_NAMES.GuidanceBooking,
    undefined,
    ["*"],
    { slot_sk: slotSk, status: GUIDANCE_BOOKING_STATUS.UPCOMING },
    "#slot_sk = :slot_sk and #status = :status"
  );
  return results[0] || null;
}

export async function createSlot(
  adminSub: string,
  data: { notification_id: string; start_time: number; meet_link: string; notes?: string }
): Promise<IGuidanceSlot> {
  try {
    if (!data.notification_id || !data.start_time || !data.meet_link) {
      throw new Error("notification_id, start_time and meet_link are required");
    }
    if (!URL_REGEX.test(data.meet_link.trim())) {
      throw new Error("meet_link must be a valid http(s) URL");
    }
    if (data.start_time < Date.now()) {
      throw new Error("start_time must be in the future");
    }

    // A guidance slot for this application must not extend past its own
    // deadline — booking a session for an application that's already closed
    // (or about to close mid-session) makes no sense.
    const notification = await getNotificationById(data.notification_id).catch(() => null);
    const lastDateToApply = notification?.last_date_to_apply ? Number(notification.last_date_to_apply) : undefined;
    if (lastDateToApply && data.start_time > lastDateToApply) {
      throw new Error("start_time must be on or before the application's last date to apply");
    }

    const pk = TABLE_PK_MAPPER.GuidanceSlot;
    const now = Date.now();
    const item: IGuidanceSlot = {
      pk,
      sk: `${pk}${ulid()}`,
      notification_id: data.notification_id,
      start_time: data.start_time,
      end_time: data.start_time + GUIDANCE_SLOT_DURATION_MS,
      meet_link: data.meet_link.trim(),
      status: GUIDANCE_SLOT_STATUS.AVAILABLE,
      notes: data.notes,
      created_by: adminSub,
      created_at: now,
      modified_at: now,
    };
    await insertDataDynamoDB(ALL_TABLE_NAMES.GuidanceSlot, item);
    return item;
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "createSlot", error, "Error creating guidance slot", "", { adminSub, data });
    throw error;
  }
}

export async function listSlotsForAdmin(
  notificationId: string | undefined,
  statusFilter: string | undefined,
  limit: number,
  startKey?: Record<string, any>,
  ownerSub?: string
): Promise<{ results: IGuidanceSlot[]; lastEvaluatedKey?: { pk: string; sk: string } }> {
  try {
    const queryFilter: Record<string, any> = {};
    const clauses: string[] = [];
    if (notificationId) {
      queryFilter[GUIDANCE_SLOT.notification_id] = notificationId;
      clauses.push("#notification_id = :notification_id");
    }
    if (statusFilter) {
      queryFilter[GUIDANCE_SLOT.status] = statusFilter;
      clauses.push("#status = :status");
    }
    // A Guidance Partner only ever sees slots they created themselves — Admin
    // passes no ownerSub and sees everyone's.
    if (ownerSub) {
      queryFilter[GUIDANCE_SLOT.created_by] = ownerSub;
      clauses.push("#created_by = :created_by");
    }
    return await fetchDynamoDBWithLimit<IGuidanceSlot>(
      ALL_TABLE_NAMES.GuidanceSlot,
      limit,
      startKey,
      ["*"],
      clauses.length ? queryFilter : undefined,
      clauses.length ? clauses.join(" and ") : undefined,
      false // most-recently-created slots first
    );
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "listSlotsForAdmin", error, "Error listing guidance slots", "", { notificationId, statusFilter, ownerSub });
    throw error;
  }
}

export async function getAvailableSlotsForNotification(notificationId: string): Promise<IGuidanceSlot[]> {
  try {
    const results = await fetchDynamoDB<IGuidanceSlot>(
      ALL_TABLE_NAMES.GuidanceSlot,
      undefined,
      ["*"],
      { notification_id: notificationId, status: GUIDANCE_SLOT_STATUS.AVAILABLE },
      "#notification_id = :notification_id and #status = :status"
    );
    const now = Date.now();
    const candidates = results
      .filter((slot) => slot.start_time >= now)
      .sort((a, b) => a.start_time - b.start_time);
    if (candidates.length === 0) return [];

    // Each Guidance Partner (or Admin) runs their own calendar, so a given
    // wall-clock time can only host one session PER PARTNER — even if it was
    // separately created as a slot for a different notification. Hide a
    // candidate only when the SAME creator already has a booking at that
    // exact start_time; a different partner's slot at the same time is a
    // different person and stays available.
    const bookedElsewhere = await fetchDynamoDB<IGuidanceSlot>(
      ALL_TABLE_NAMES.GuidanceSlot,
      undefined,
      ["*"],
      { status: GUIDANCE_SLOT_STATUS.BOOKED },
      "#status = :status"
    );
    const occupiedByCreator = new Set(bookedElsewhere.map((s) => `${s.created_by}#${s.start_time}`));

    return candidates.filter((slot) => !occupiedByCreator.has(`${slot.created_by}#${slot.start_time}`));
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "getAvailableSlotsForNotification", error, "Error fetching available slots", "", { notificationId });
    throw error;
  }
}

export async function setSlotAvailability(
  slotSk: string,
  available: boolean,
  callerSub?: string,
  callerRole?: string
): Promise<IGuidanceSlot> {
  try {
    const slot = await getSlotBySk(slotSk);
    if (!slot) throw new Error("SLOT_NOT_FOUND");
    if (callerRole !== "admin" && callerSub && slot.created_by !== callerSub) {
      throw new Error("NOT_YOUR_SLOT");
    }
    if (slot.status === GUIDANCE_SLOT_STATUS.BOOKED) {
      throw new Error("SLOT_ALREADY_BOOKED");
    }
    if (slot.status === GUIDANCE_SLOT_STATUS.CANCELLED || slot.status === GUIDANCE_SLOT_STATUS.COMPLETED) {
      throw new Error("SLOT_TERMINAL_STATE");
    }
    const newStatus = available ? GUIDANCE_SLOT_STATUS.AVAILABLE : GUIDANCE_SLOT_STATUS.UNAVAILABLE;
    await updateDynamoDB(TABLE_PK_MAPPER.GuidanceSlot, slotSk, { status: newStatus });
    return { ...slot, status: newStatus };
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "setSlotAvailability", error, "Error setting slot availability", "", { slotSk, available });
    throw error;
  }
}

/**
 * Admin cancels a slot outright — whether it was booked or not. Per the V1
 * spec, an admin-initiated cancellation of an already-booked slot must NOT
 * consume the user's 3-slot allowance, so the booking flips to
 * CANCELLED_BY_ADMIN (excluded from the allowance count) rather than being
 * deleted, and a best-effort notice email is sent.
 */
export async function cancelSlot(
  slotSk: string,
  reason?: string,
  callerSub?: string,
  callerRole?: string
): Promise<{ slot: IGuidanceSlot; cancelledBooking?: IGuidanceBooking }> {
  try {
    const slot = await getSlotBySk(slotSk);
    if (!slot) throw new Error("SLOT_NOT_FOUND");
    if (callerRole !== "admin" && callerSub && slot.created_by !== callerSub) {
      throw new Error("NOT_YOUR_SLOT");
    }
    if (slot.status === GUIDANCE_SLOT_STATUS.CANCELLED) {
      return { slot };
    }

    let cancelledBooking: IGuidanceBooking | undefined;
    if (slot.status === GUIDANCE_SLOT_STATUS.BOOKED) {
      const booking = await getActiveBookingForSlot(slotSk);
      if (booking) {
        const now = Date.now();
        // updateDynamoDB references every key in its UpdateExpression, and
        // DynamoDB rejects `undefined` values — only include cancel_reason
        // when a reason was actually given.
        const bookingUpdates: Record<string, any> = {
          [GUIDANCE_BOOKING.status]: GUIDANCE_BOOKING_STATUS.CANCELLED_BY_ADMIN,
          [GUIDANCE_BOOKING.cancelled_at]: now,
        };
        if (reason !== undefined) bookingUpdates[GUIDANCE_BOOKING.cancel_reason] = reason;
        await updateDynamoDB(TABLE_PK_MAPPER.GuidanceBooking, booking.sk!, bookingUpdates);
        cancelledBooking = { ...booking, status: GUIDANCE_BOOKING_STATUS.CANCELLED_BY_ADMIN, cancel_reason: reason, cancelled_at: now };

        // Best-effort — a failed/unconfigured email must never block the cancellation itself.
        try {
          await sendAdminCancellationEmail(booking, slot.start_time, reason);
        } catch (emailError) {
          logErrorLocation("guidanceSlotService.ts", "cancelSlot:sendEmail", emailError, "Failed to send cancellation email", "", { slotSk });
        }
      }
    }

    const slotUpdates: Record<string, any> = {
      [GUIDANCE_SLOT.status]: GUIDANCE_SLOT_STATUS.CANCELLED,
      [GUIDANCE_SLOT.cancelled_at]: Date.now(),
    };
    if (reason !== undefined) slotUpdates[GUIDANCE_SLOT.cancel_reason] = reason;
    await updateDynamoDB(TABLE_PK_MAPPER.GuidanceSlot, slotSk, slotUpdates);

    return { slot: { ...slot, status: GUIDANCE_SLOT_STATUS.CANCELLED, cancel_reason: reason }, cancelledBooking };
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "cancelSlot", error, "Error cancelling guidance slot", "", { slotSk, reason });
    throw error;
  }
}

/**
 * Hard-deletes whichever of the given slots are still AVAILABLE (never
 * booked) and owned by the caller (Admin is unrestricted). Booked/completed/
 * already-cancelled slots are silently skipped — those have a real booking
 * referencing them and need individual handling via cancelSlot() instead —
 * an AVAILABLE slot has neither a booking nor an email owed, so there's
 * nothing worth preserving by soft-cancelling it; deleting it avoids leaving
 * dead "cancelled" rows behind forever. Shared by both the "delete all
 * available for this notification" and "delete these specific slots" flows.
 */
async function deleteSlotsIfAvailable(
  slots: IGuidanceSlot[],
  callerSub?: string,
  callerRole?: string
): Promise<{ deletedCount: number; skippedCount: number }> {
  const deletable = slots.filter(
    (slot) =>
      slot.status === GUIDANCE_SLOT_STATUS.AVAILABLE &&
      (callerRole === "admin" || !callerSub || slot.created_by === callerSub)
  );
  const outcomes = await Promise.allSettled(
    deletable.map((slot) => deleteDynamoDB(TABLE_PK_MAPPER.GuidanceSlot, slot.sk!))
  );
  const deletedCount = outcomes.filter((o) => o.status === "fulfilled" && o.value === true).length;
  return { deletedCount, skippedCount: slots.length - deletedCount };
}

/**
 * Deletes every still-AVAILABLE slot for a notification in one action — the
 * common cleanup need once a notification's deadline has passed and its
 * unused open slots are just clutter.
 */
export async function bulkCancelAvailableSlots(
  notificationId: string,
  callerSub?: string,
  callerRole?: string
): Promise<{ cancelledCount: number; failedCount: number }> {
  try {
    const ownerSub = callerRole === "admin" ? undefined : callerSub;
    const { results: availableSlots } = await listSlotsForAdmin(
      notificationId,
      GUIDANCE_SLOT_STATUS.AVAILABLE,
      500,
      undefined,
      ownerSub
    );
    const { deletedCount, skippedCount } = await deleteSlotsIfAvailable(availableSlots, callerSub, callerRole);
    return { cancelledCount: deletedCount, failedCount: skippedCount };
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "bulkCancelAvailableSlots", error, "Error bulk-deleting available slots", "", { notificationId });
    throw error;
  }
}

/**
 * Deletes a specific, admin-picked set of slots — for the "select a few
 * available slots and delete just those" flow. Any slot in the list that
 * isn't AVAILABLE (or isn't owned by a non-admin caller) is silently
 * skipped rather than erroring the whole batch.
 */
export async function bulkDeleteSlots(
  slotSks: string[],
  callerSub?: string,
  callerRole?: string
): Promise<{ deletedCount: number; skippedCount: number }> {
  try {
    const slots = (await Promise.all(slotSks.map((sk) => getSlotBySk(sk)))).filter(
      (s): s is IGuidanceSlot => !!s
    );
    return await deleteSlotsIfAvailable(slots, callerSub, callerRole);
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "bulkDeleteSlots", error, "Error deleting selected slots", "", { slotSks });
    throw error;
  }
}

export async function markSlotCompleted(slotSk: string): Promise<void> {
  try {
    await updateDynamoDB(TABLE_PK_MAPPER.GuidanceSlot, slotSk, { [GUIDANCE_SLOT.status]: GUIDANCE_SLOT_STATUS.COMPLETED });
  } catch (error) {
    logErrorLocation("guidanceSlotService.ts", "markSlotCompleted", error, "Error marking slot completed", "", { slotSk });
    throw error;
  }
}

export { getSlotBySk, getActiveBookingForSlot };
