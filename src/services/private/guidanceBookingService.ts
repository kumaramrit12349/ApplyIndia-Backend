import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import {
  GUIDANCE_BOOKING,
  GUIDANCE_BOOKING_STATUS,
  GUIDANCE_BOOKING_STATUSES_COUNTED_TOWARD_LIMIT,
  GUIDANCE_CANCEL_CUTOFF_MS,
  MAX_GUIDANCE_BOOKINGS_PER_NOTIFICATION,
} from "../../db_schema/GuidanceBooking/GuidanceBookingConstant";
import { IGuidanceBooking } from "../../db_schema/GuidanceBooking/GuidanceBookingInterface";
import { GUIDANCE_SLOT_STATUS } from "../../db_schema/GuidanceSlot/GuidanceSlotConstant";
import { IGuidanceSlot } from "../../db_schema/GuidanceSlot/GuidanceSlotInterface";
import { fetchDynamoDB, fetchDynamoDBWithLimit } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB, conditionallyMarkSlotBooked } from "../../Interpreter/dynamoDB/updateCalls";
import { getSlotBySk, markSlotCompleted } from "./guidanceSlotService";
import { getNotificationById } from "./notificationService";
import { getUserProfile, getCognitoUserEmail } from "../authService";
import { sendEmail } from "../external/emailService";
import { renderEmailTemplate } from "./emailTemplateService";
import { EMAIL_TEMPLATE_KEYS } from "../../db_schema/EmailTemplate/EmailTemplateConstant";
import { EMAIL_CHANNEL } from "../../db_schema/PlatformSettings/PlatformSettingsConstant";
import { buildNotificationUrl } from "./notificationDistributionService";
import { logErrorLocation } from "../../utils/errorUtils";

async function sendBookingConfirmationEmail(booking: IGuidanceBooking): Promise<void> {
  const rendered = await renderEmailTemplate(EMAIL_TEMPLATE_KEYS.GUIDANCE_BOOKING_CONFIRMED, {
    user_name: booking.user_name || "there",
    notification_title: booking.notification_title,
    date: new Date(booking.slot_start_time).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: new Date(booking.slot_start_time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    meet_link: booking.meet_link,
    notification_url: buildNotificationUrl(booking.notification_title, booking.notification_id),
  });
  if (!rendered) {
    logErrorLocation(
      "guidanceBookingService.ts",
      "sendBookingConfirmationEmail",
      new Error("Template not found"),
      `No email template configured for key '${EMAIL_TEMPLATE_KEYS.GUIDANCE_BOOKING_CONFIRMED}'`,
      "",
      { bookingSk: booking.sk }
    );
    return;
  }
  await sendEmail(booking.user_email, rendered.subject, rendered.html, EMAIL_CHANNEL.GUIDANCE);
}

async function getBookingBySk(bookingSk: string): Promise<IGuidanceBooking | null> {
  const results = await fetchDynamoDB<IGuidanceBooking>(ALL_TABLE_NAMES.GuidanceBooking, bookingSk);
  return results[0] || null;
}

async function getBookingsForUserAndNotification(userSub: string, notificationId: string): Promise<IGuidanceBooking[]> {
  return fetchDynamoDB<IGuidanceBooking>(
    ALL_TABLE_NAMES.GuidanceBooking,
    undefined,
    ["*"],
    { notification_id: notificationId, user_sub: userSub },
    "#notification_id = :notification_id and #user_sub = :user_sub"
  );
}

export async function getBookingAllowance(
  userSub: string,
  notificationId: string
): Promise<{ used: number; max: number; hasActiveUpcoming: boolean }> {
  try {
    const bookings = await getBookingsForUserAndNotification(userSub, notificationId);
    const used = bookings.filter((b) =>
      GUIDANCE_BOOKING_STATUSES_COUNTED_TOWARD_LIMIT.includes(b.status)
    ).length;
    const hasActiveUpcoming = bookings.some((b) => b.status === GUIDANCE_BOOKING_STATUS.UPCOMING);
    return { used, max: MAX_GUIDANCE_BOOKINGS_PER_NOTIFICATION, hasActiveUpcoming };
  } catch (error) {
    logErrorLocation("guidanceBookingService.ts", "getBookingAllowance", error, "Error computing booking allowance", "", { userSub, notificationId });
    throw error;
  }
}

export async function createBooking(
  userSub: string,
  params: { notification_id: string; slot_sk: string; issue_note?: string }
): Promise<IGuidanceBooking> {
  try {
    const slot = await getSlotBySk(params.slot_sk);
    if (!slot || slot.notification_id !== params.notification_id) {
      throw new Error("SLOT_NOT_FOUND");
    }
    if (slot.status !== GUIDANCE_SLOT_STATUS.AVAILABLE || slot.start_time < Date.now()) {
      throw new Error("SLOT_ALREADY_BOOKED");
    }

    // Defense in depth — the booking UI only offers this for guidance-available,
    // still-open notifications, but enforce it server-side too since this
    // endpoint could otherwise be called directly.
    const notification = await getNotificationById(params.notification_id).catch(() => null);
    if (!notification?.guidance_available || !notification.guidance_link) {
      throw new Error("GUIDANCE_NOT_AVAILABLE");
    }
    if (notification.last_date_to_apply && Number(notification.last_date_to_apply) < Date.now()) {
      throw new Error("DEADLINE_PASSED");
    }

    // Each Guidance Partner (or Admin) runs their own calendar — if this
    // exact wall-clock time is already booked via a DIFFERENT notification's
    // slot record BY THE SAME CREATOR, this one is effectively unavailable
    // too (defense in depth; getAvailableSlotsForNotification already hides
    // these from the list). A different partner's slot at the same time is a
    // different person and is not a conflict.
    const bookedElsewhere = await fetchDynamoDB<IGuidanceSlot>(
      ALL_TABLE_NAMES.GuidanceSlot,
      undefined,
      ["*"],
      { status: GUIDANCE_SLOT_STATUS.BOOKED },
      "#status = :status"
    );
    if (bookedElsewhere.some((s) => s.sk !== params.slot_sk && s.start_time === slot.start_time && s.created_by === slot.created_by)) {
      throw new Error("SLOT_ALREADY_BOOKED");
    }

    const { used, hasActiveUpcoming } = await getBookingAllowance(userSub, params.notification_id);
    if (hasActiveUpcoming) throw new Error("ACTIVE_BOOKING_EXISTS");
    if (used >= MAX_GUIDANCE_BOOKINGS_PER_NOTIFICATION) throw new Error("BOOKING_LIMIT_REACHED");

    const pk = TABLE_PK_MAPPER.GuidanceBooking;
    const bookingSk = `${pk}${ulid()}`;

    const wonRace = await conditionallyMarkSlotBooked(params.slot_sk, bookingSk);
    if (!wonRace) throw new Error("SLOT_ALREADY_BOOKED");

    const profile = await getUserProfile(userSub).catch(() => null);
    const email = profile?.email || (await getCognitoUserEmail(userSub).catch(() => undefined));
    if (!email) throw new Error("USER_EMAIL_NOT_FOUND");
    const name = profile ? `${profile.given_name || ""} ${profile.family_name || ""}`.trim() : undefined;

    const now = Date.now();
    const booking: IGuidanceBooking = {
      pk,
      sk: bookingSk,
      notification_id: params.notification_id,
      notification_title: notification?.title || "Application",
      slot_sk: params.slot_sk,
      slot_created_by: slot.created_by,
      slot_start_time: slot.start_time,
      slot_end_time: slot.end_time,
      meet_link: slot.meet_link,
      user_sub: userSub,
      user_name: name,
      user_email: email,
      status: GUIDANCE_BOOKING_STATUS.UPCOMING,
      issue_note: params.issue_note,
      booked_at: now,
    };
    await insertDataDynamoDB(ALL_TABLE_NAMES.GuidanceBooking, booking);

    try {
      await sendBookingConfirmationEmail(booking);
    } catch (emailError) {
      logErrorLocation("guidanceBookingService.ts", "createBooking:sendEmail", emailError, "Failed to send booking confirmation email", "", { bookingSk });
    }

    return booking;
  } catch (error) {
    logErrorLocation("guidanceBookingService.ts", "createBooking", error, "Error creating guidance booking", "", { userSub, params });
    throw error;
  }
}

export async function cancelMyBooking(userSub: string, bookingSk: string): Promise<IGuidanceBooking> {
  try {
    const booking = await getBookingBySk(bookingSk);
    if (!booking || booking.user_sub !== userSub) throw new Error("BOOKING_NOT_FOUND");
    if (booking.status !== GUIDANCE_BOOKING_STATUS.UPCOMING) throw new Error("BOOKING_NOT_CANCELLABLE");

    const slot = await getSlotBySk(booking.slot_sk);
    if (slot && slot.start_time - Date.now() < GUIDANCE_CANCEL_CUTOFF_MS) {
      throw new Error("CANCEL_WINDOW_PASSED");
    }

    const now = Date.now();
    await updateDynamoDB(TABLE_PK_MAPPER.GuidanceBooking, bookingSk, {
      [GUIDANCE_BOOKING.status]: GUIDANCE_BOOKING_STATUS.CANCELLED_BY_USER,
      [GUIDANCE_BOOKING.cancelled_at]: now,
    });

    if (slot) {
      await updateDynamoDB(TABLE_PK_MAPPER.GuidanceSlot, booking.slot_sk, {
        status: GUIDANCE_SLOT_STATUS.AVAILABLE,
        booking_sk: null,
      });
    }

    return { ...booking, status: GUIDANCE_BOOKING_STATUS.CANCELLED_BY_USER, cancelled_at: now };
  } catch (error) {
    logErrorLocation("guidanceBookingService.ts", "cancelMyBooking", error, "Error cancelling guidance booking", "", { userSub, bookingSk });
    throw error;
  }
}

export async function markBookingOutcome(
  bookingSk: string,
  outcome: GUIDANCE_BOOKING_STATUS.COMPLETED | GUIDANCE_BOOKING_STATUS.NO_SHOW,
  adminNotes?: string,
  callerSub?: string,
  callerRole?: string
): Promise<IGuidanceBooking> {
  try {
    const booking = await getBookingBySk(bookingSk);
    if (!booking) throw new Error("BOOKING_NOT_FOUND");
    if (callerRole !== "admin" && callerSub && booking.slot_created_by !== callerSub) {
      throw new Error("NOT_YOUR_BOOKING");
    }
    if (booking.status !== GUIDANCE_BOOKING_STATUS.UPCOMING) throw new Error("BOOKING_ALREADY_FINALIZED");

    const now = Date.now();
    // updateDynamoDB references every key in this object in its
    // UpdateExpression, but DynamoDB rejects `undefined` values — so optional
    // fields must only be included when actually provided, not set to
    // `undefined` (that's what broke this endpoint: adminNotes is optional,
    // and passing it through unconditionally produced a stray
    // #admin_notes = :admin_notes with no matching value, a ValidationException).
    const updates: Record<string, any> = {
      [GUIDANCE_BOOKING.status]: outcome,
    };
    if (adminNotes !== undefined) updates[GUIDANCE_BOOKING.admin_notes] = adminNotes;
    if (outcome === GUIDANCE_BOOKING_STATUS.COMPLETED) updates[GUIDANCE_BOOKING.completed_at] = now;
    await updateDynamoDB(TABLE_PK_MAPPER.GuidanceBooking, bookingSk, updates);
    await markSlotCompleted(booking.slot_sk);

    return { ...booking, status: outcome, admin_notes: adminNotes, completed_at: outcome === GUIDANCE_BOOKING_STATUS.COMPLETED ? now : booking.completed_at };
  } catch (error) {
    logErrorLocation("guidanceBookingService.ts", "markBookingOutcome", error, "Error marking booking outcome", "", { bookingSk, outcome });
    throw error;
  }
}

export async function listMyBookings(
  userSub: string,
  opts: { limit?: number; startKey?: Record<string, any> } = {}
): Promise<{ results: IGuidanceBooking[]; lastEvaluatedKey?: { pk: string; sk: string } }> {
  try {
    return await fetchDynamoDBWithLimit<IGuidanceBooking>(
      ALL_TABLE_NAMES.GuidanceBooking,
      opts.limit || 30,
      opts.startKey,
      ["*"],
      { user_sub: userSub },
      "#user_sub = :user_sub",
      false
    );
  } catch (error) {
    logErrorLocation("guidanceBookingService.ts", "listMyBookings", error, "Error listing my guidance bookings", "", { userSub });
    throw error;
  }
}

export async function listBookingsForAdmin(opts: {
  notificationId?: string;
  status?: string;
  limit: number;
  startKey?: Record<string, any>;
  ownerSub?: string;
}): Promise<{ results: IGuidanceBooking[]; lastEvaluatedKey?: { pk: string; sk: string } }> {
  try {
    const queryFilter: Record<string, any> = {};
    const clauses: string[] = [];
    if (opts.notificationId) {
      queryFilter.notification_id = opts.notificationId;
      clauses.push("#notification_id = :notification_id");
    }
    if (opts.status) {
      queryFilter.status = opts.status;
      clauses.push("#status = :status");
    }
    // A Guidance Partner only ever sees bookings for slots they created
    // themselves — Admin passes no ownerSub and sees everyone's.
    if (opts.ownerSub) {
      queryFilter.slot_created_by = opts.ownerSub;
      clauses.push("#slot_created_by = :slot_created_by");
    }
    return await fetchDynamoDBWithLimit<IGuidanceBooking>(
      ALL_TABLE_NAMES.GuidanceBooking,
      opts.limit,
      opts.startKey,
      ["*"],
      clauses.length ? queryFilter : undefined,
      clauses.length ? clauses.join(" and ") : undefined,
      false
    );
  } catch (error) {
    logErrorLocation("guidanceBookingService.ts", "listBookingsForAdmin", error, "Error listing guidance bookings for admin", "", opts);
    throw error;
  }
}

export { getBookingBySk };
