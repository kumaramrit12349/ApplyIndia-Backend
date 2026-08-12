import { ALL_TABLE_NAMES, NOTIFICATION_CATEGORIES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { INotification } from "../../db_schema/Notification/NotificationInterface";
import { ISocialPost } from "../../db_schema/SocialPost/SocialPostInterface";
import { getSocialPostSk, SOCIAL_PLATFORM } from "../../db_schema/SocialPost/SocialPostConstant";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { updateItemDynamoDB } from "../../dynamoDB_CRUD/updateData";
import { getNotificationById } from "./notificationService";
import { buildNotificationUrl, formatCategoryTitle, formatLastDateToApply, getNotificationId } from "./notificationDistributionService";
import { sendTelegramMessage } from "../external/telegramService";
import { logErrorLocation } from "../../utils/errorUtils";

/**
 * Publishes an approved notification to Telegram (src/notification-delivery/
 * notificationSocialLambda.ts's core logic), mirroring the shape of the
 * email fan-out (notificationFanoutService.ts) but for a single social post
 * rather than a per-user fan-out.
 */

const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

// One entry per NOTIFICATION_CATEGORIES value — #ApplyIndia is always appended on top of these.
const CATEGORY_HASHTAGS: Record<string, string[]> = {
  [NOTIFICATION_CATEGORIES.JOB]: ["#GovernmentJobs", "#SarkariNaukri"],
  [NOTIFICATION_CATEGORIES.ADMIT_CARD]: ["#AdmitCard"],
  [NOTIFICATION_CATEGORIES.SYLLABUS]: ["#Syllabus"],
  [NOTIFICATION_CATEGORIES.ANSWER_KEY]: ["#AnswerKey"],
  [NOTIFICATION_CATEGORIES.RESULT]: ["#Result"],
  [NOTIFICATION_CATEGORIES.ENTRANCE_EXAM]: ["#EntranceExam"],
  [NOTIFICATION_CATEGORIES.ADMISSION]: ["#Admission"],
  [NOTIFICATION_CATEGORIES.SCHOLARSHIP]: ["#Scholarship"],
  [NOTIFICATION_CATEGORIES.SARKARI_YOJANA]: ["#SarkariYojana"],
  [NOTIFICATION_CATEGORIES.DOCUMENTS]: ["#Documents"],
};

/** parse_mode is "HTML" — anything interpolated into the message must be escaped or Telegram can 400 or mis-render. */
function escapeHtml(text?: string): string {
  return (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Builds the Telegram post text for a notification: title, department,
 * vacancies, eligibility, last date, application fee (this codebase has no
 * job-salary field — "Salary/fee where applicable" maps to the application
 * fee that actually exists on the record), the notification link, and
 * category-derived hashtags. Truncated to Telegram's 4096-char message cap.
 */
export function buildTelegramMessage(notification: INotification): string {
  const title = escapeHtml(notification.title);
  const department = escapeHtml(notification.department);
  const categoryTitle = formatCategoryTitle(notification.category);
  const url = buildNotificationUrl(notification.title, getNotificationId(notification.sk!));

  const lines: string[] = [`🚨 <b>${title}</b>`, ""];

  if (department && department.toUpperCase() !== "UNKNOWN") {
    lines.push(`${categoryTitle} notification released by ${department}.`, "");
  }

  if (notification.total_vacancies) {
    lines.push(`📌 Vacancies: ${notification.total_vacancies}`);
  }
  if (notification.eligibility?.qualification) {
    lines.push(`🎓 Qualification: ${escapeHtml(notification.eligibility.qualification)}`);
  }
  if (notification.eligibility?.min_age || notification.eligibility?.max_age) {
    lines.push(`🎂 Age Limit: ${notification.eligibility?.min_age || "-"}–${notification.eligibility?.max_age || "-"} Years`);
  }
  if (notification.fee?.general_fee) {
    lines.push(`💰 Application Fee: ₹${notification.fee.general_fee}`);
  }
  lines.push(`📅 Last Date: ${formatLastDateToApply(notification.last_date_to_apply)}`);
  lines.push("", `👉 Check complete details & Apply:`, url, "");

  const hashtags = [...(CATEGORY_HASHTAGS[notification.category?.toLowerCase()] || []), "#ApplyIndia"];
  lines.push(hashtags.join(" "));

  const message = lines.join("\n");
  return message.length > TELEGRAM_MESSAGE_MAX_LENGTH
    ? message.slice(0, TELEGRAM_MESSAGE_MAX_LENGTH - 1) + "…"
    : message;
}

/**
 * Atomically creates a "pending" SocialPost record only if one doesn't
 * already exist for this notification+platform. Returns false (a no-op,
 * not an error) if it already exists — the composite sk plus this
 * conditional write is what actually prevents duplicate Telegram posts
 * when the same approval event is processed more than once.
 */
async function createSocialPostIfAbsent(notificationId: string, platform: string, content: string): Promise<boolean> {
  const sk = getSocialPostSk(notificationId, platform);
  try {
    await updateItemDynamoDB({
      Key: { pk: TABLE_PK_MAPPER.SocialPost, sk },
      UpdateExpression:
        "set #notification_id = :nid, #platform = :platform, #status = :status, #content = :content, #retry_count = :zero, #created_at = :created_at",
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#notification_id": "notification_id",
        "#platform": "platform",
        "#status": "status",
        "#content": "content",
        "#retry_count": "retry_count",
        "#created_at": "created_at",
      },
      ExpressionAttributeValues: {
        ":nid": notificationId,
        ":platform": platform,
        ":status": "pending",
        ":content": content,
        ":zero": 0,
        ":created_at": Date.now(),
      },
    });
    return true;
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

async function markSocialPostPublished(notificationId: string, platform: string, externalPostId: string): Promise<void> {
  const sk = getSocialPostSk(notificationId, platform);
  await updateDynamoDB(TABLE_PK_MAPPER.SocialPost, sk, {
    status: "published",
    external_post_id: externalPostId,
    published_at: Date.now(),
    error_message: null,
  });
}

async function markSocialPostFailed(notificationId: string, platform: string, errorMessage: string): Promise<void> {
  const sk = getSocialPostSk(notificationId, platform);
  await updateDynamoDB(TABLE_PK_MAPPER.SocialPost, sk, { status: "failed", error_message: errorMessage });
}

/** All SocialPost records for a notification, across every platform (currently just Telegram). */
export async function getSocialPostsForNotification(notificationId: string): Promise<ISocialPost[]> {
  return fetchDynamoDB<ISocialPost>(
    ALL_TABLE_NAMES.SocialPost,
    undefined,
    ["*"],
    undefined,
    undefined,
    undefined,
    undefined,
    `SocialPost#${notificationId}#`,
  );
}

/**
 * Entry point called by notificationSocialLambda.ts for one notification
 * approval (mode "initial") or one admin-triggered retry (mode "retry").
 * Currently Telegram-only — SOCIAL_PLATFORM.TELEGRAM is the only caller.
 */
export async function publishNotificationToTelegram(notificationId: string, mode: "initial" | "retry"): Promise<void> {
  const platform = SOCIAL_PLATFORM.TELEGRAM;
  const notification = await getNotificationById(notificationId);
  if (!notification || !notification.sk) {
    logErrorLocation("socialPostService.ts", "publishNotificationToTelegram", new Error("Notification not found"), "", "", { notificationId });
    return;
  }
  // Guards a race where the notification was archived/unapproved between
  // enqueue and this Lambda picking up the message.
  if (notification.review_status !== "approved" || notification.is_archived) return;
  // Admin has explicitly opted this notification out of Telegram publishing.
  if (notification.send_telegram_notification === false) return;

  if (mode === "initial") {
    const content = buildTelegramMessage(notification);
    const created = await createSocialPostIfAbsent(notificationId, platform, content);
    if (!created) return; // already processed — the idempotency guard
    await publishAndFinalize(notificationId, platform, content);
  } else {
    const existing = (await getSocialPostsForNotification(notificationId)).find((p) => p.platform === platform);
    if (!existing || existing.status !== "failed") return; // nothing to retry
    const sk = getSocialPostSk(notificationId, platform);
    await updateDynamoDB(TABLE_PK_MAPPER.SocialPost, sk, {
      status: "pending",
      retry_count: (existing.retry_count || 0) + 1,
    });
    await publishAndFinalize(notificationId, platform, existing.content);
  }
}

async function publishAndFinalize(notificationId: string, platform: string, content: string): Promise<void> {
  const result = await sendTelegramMessage(content);
  if (result.success && result.id) {
    await markSocialPostPublished(notificationId, platform, result.id);
  } else {
    await markSocialPostFailed(notificationId, platform, result.skipped ? "Telegram not configured" : result.error || "Unknown error");
  }
}
