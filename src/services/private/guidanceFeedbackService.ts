import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import {
  GUIDANCE_FEEDBACK,
  GUIDANCE_MODERATION_STATUS,
  GUIDANCE_PROBLEM_SOLVED,
  GUIDANCE_TOPIC_TAGS,
  GuidanceTopicTag,
} from "../../db_schema/GuidanceFeedback/GuidanceFeedbackConstant";
import { IGuidanceFeedback } from "../../db_schema/GuidanceFeedback/GuidanceFeedbackInterface";
import { GUIDANCE_BOOKING_STATUS } from "../../db_schema/GuidanceBooking/GuidanceBookingConstant";
import { fetchDynamoDB, fetchDynamoDBWithLimit } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { getBookingBySk } from "./guidanceBookingService";
import { logErrorLocation } from "../../utils/errorUtils";

export type ModerationAction = "publish" | "hide" | "feature" | "unfeature";

async function getFeedbackForBooking(bookingSk: string): Promise<IGuidanceFeedback | null> {
  const results = await fetchDynamoDB<IGuidanceFeedback>(
    ALL_TABLE_NAMES.GuidanceFeedback,
    undefined,
    ["*"],
    { booking_sk: bookingSk },
    "#booking_sk = :booking_sk"
  );
  return results[0] || null;
}

async function getFeedbackBySk(feedbackSk: string): Promise<IGuidanceFeedback | null> {
  const results = await fetchDynamoDB<IGuidanceFeedback>(ALL_TABLE_NAMES.GuidanceFeedback, feedbackSk);
  return results[0] || null;
}

export async function submitFeedback(
  userSub: string,
  params: {
    booking_sk: string;
    rating: number;
    problem_solved: GUIDANCE_PROBLEM_SOLVED;
    topic_tags: GuidanceTopicTag[];
    message?: string;
    consent_public: boolean;
  }
): Promise<IGuidanceFeedback> {
  try {
    if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
      throw new Error("rating must be an integer between 1 and 5");
    }
    if (!Object.values(GUIDANCE_PROBLEM_SOLVED).includes(params.problem_solved)) {
      throw new Error("Invalid problem_solved value");
    }
    const invalidTags = (params.topic_tags || []).filter((t) => !GUIDANCE_TOPIC_TAGS.includes(t));
    if (invalidTags.length) throw new Error(`Invalid topic_tags: ${invalidTags.join(", ")}`);

    const booking = await getBookingBySk(params.booking_sk);
    if (!booking || booking.user_sub !== userSub) throw new Error("BOOKING_NOT_FOUND");
    if (booking.status !== GUIDANCE_BOOKING_STATUS.COMPLETED) throw new Error("BOOKING_NOT_COMPLETED");

    const existing = await getFeedbackForBooking(params.booking_sk);
    if (existing) throw new Error("FEEDBACK_ALREADY_SUBMITTED");

    const pk = TABLE_PK_MAPPER.GuidanceFeedback;
    const item: IGuidanceFeedback = {
      pk,
      sk: `${pk}${ulid()}`,
      booking_sk: params.booking_sk,
      notification_id: booking.notification_id,
      user_sub: userSub,
      rating: params.rating,
      problem_solved: params.problem_solved,
      topic_tags: params.topic_tags,
      message: params.message,
      consent_public: !!params.consent_public,
      moderation_status: GUIDANCE_MODERATION_STATUS.PENDING,
      featured: false,
      created_at: Date.now(),
    };
    await insertDataDynamoDB(ALL_TABLE_NAMES.GuidanceFeedback, item);
    return item;
  } catch (error) {
    logErrorLocation("guidanceFeedbackService.ts", "submitFeedback", error, "Error submitting guidance feedback", "", { userSub, params });
    throw error;
  }
}

export async function listFeedbackForModeration(opts: {
  status?: string;
  limit: number;
  startKey?: Record<string, any>;
}): Promise<{ results: IGuidanceFeedback[]; lastEvaluatedKey?: { pk: string; sk: string } }> {
  try {
    const queryFilter: Record<string, any> = {};
    const clauses: string[] = [];
    if (opts.status) {
      queryFilter.moderation_status = opts.status;
      clauses.push("#moderation_status = :moderation_status");
    }
    return await fetchDynamoDBWithLimit<IGuidanceFeedback>(
      ALL_TABLE_NAMES.GuidanceFeedback,
      opts.limit,
      opts.startKey,
      ["*"],
      clauses.length ? queryFilter : undefined,
      clauses.length ? clauses.join(" and ") : undefined,
      false
    );
  } catch (error) {
    logErrorLocation("guidanceFeedbackService.ts", "listFeedbackForModeration", error, "Error listing feedback for moderation", "", opts);
    throw error;
  }
}

export async function moderateFeedback(
  adminSub: string,
  feedbackSk: string,
  action: ModerationAction,
  displayNameOverride?: string
): Promise<IGuidanceFeedback> {
  try {
    const feedback = await getFeedbackBySk(feedbackSk);
    if (!feedback) throw new Error("FEEDBACK_NOT_FOUND");

    const updates: Record<string, any> = {
      [GUIDANCE_FEEDBACK.moderated_by]: adminSub,
      [GUIDANCE_FEEDBACK.moderated_at]: Date.now(),
    };
    if (displayNameOverride) updates[GUIDANCE_FEEDBACK.display_name] = displayNameOverride;

    let moderation_status = feedback.moderation_status;
    let featured = feedback.featured;

    if (action === "publish") {
      if (!feedback.consent_public) throw new Error("CONSENT_NOT_GIVEN");
      moderation_status = GUIDANCE_MODERATION_STATUS.PUBLISHED;
      updates[GUIDANCE_FEEDBACK.moderation_status] = moderation_status;
    } else if (action === "hide") {
      moderation_status = GUIDANCE_MODERATION_STATUS.HIDDEN;
      updates[GUIDANCE_FEEDBACK.moderation_status] = moderation_status;
    } else if (action === "feature") {
      featured = true;
      updates[GUIDANCE_FEEDBACK.featured] = featured;
    } else if (action === "unfeature") {
      featured = false;
      updates[GUIDANCE_FEEDBACK.featured] = featured;
    }

    await updateDynamoDB(TABLE_PK_MAPPER.GuidanceFeedback, feedbackSk, updates);
    return { ...feedback, ...updates, moderation_status, featured };
  } catch (error) {
    logErrorLocation("guidanceFeedbackService.ts", "moderateFeedback", error, "Error moderating guidance feedback", "", { adminSub, feedbackSk, action });
    throw error;
  }
}

export async function getGuidanceStats(): Promise<{
  totalSlots: number;
  upcomingBookings: number;
  completedSessions: number;
  noShowRate: number;
  publishedFeedback: number;
}> {
  try {
    const [slots, bookings, feedback] = await Promise.all([
      fetchDynamoDB<any>(ALL_TABLE_NAMES.GuidanceSlot, undefined, ["*"]),
      fetchDynamoDB<any>(ALL_TABLE_NAMES.GuidanceBooking, undefined, ["*"]),
      fetchDynamoDB<any>(ALL_TABLE_NAMES.GuidanceFeedback, undefined, ["*"]),
    ]);

    const upcomingBookings = bookings.filter((b) => b.status === GUIDANCE_BOOKING_STATUS.UPCOMING).length;
    const completedSessions = bookings.filter((b) => b.status === GUIDANCE_BOOKING_STATUS.COMPLETED).length;
    const noShows = bookings.filter((b) => b.status === GUIDANCE_BOOKING_STATUS.NO_SHOW).length;
    const finalized = completedSessions + noShows;
    const publishedFeedback = feedback.filter((f) => f.moderation_status === GUIDANCE_MODERATION_STATUS.PUBLISHED).length;

    return {
      totalSlots: slots.length,
      upcomingBookings,
      completedSessions,
      noShowRate: finalized > 0 ? Math.round((noShows / finalized) * 100) : 0,
      publishedFeedback,
    };
  } catch (error) {
    logErrorLocation("guidanceFeedbackService.ts", "getGuidanceStats", error, "Error computing guidance stats", "", {});
    throw error;
  }
}
