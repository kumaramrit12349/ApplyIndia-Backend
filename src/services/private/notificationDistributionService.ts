import { marshall } from "@aws-sdk/util-dynamodb";
import { IUser } from "../../db_schema/User/UserInterface";
import { INotification } from "../../db_schema/Notification/NotificationInterface";
import { IDistributionLog } from "../../db_schema/Notification/DistributionInterface";
import { TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { NOTIFICATION_TYPE_MAPPER } from "../../db_schema/Notification/NotificationConstant";
import { getItemFromDynamoDB } from "../../dynamoDB_CRUD/fetchData";
import { DYNAMODB_CONFIG, COGNITO_CONFIG } from "../../config/env";
import { inferTopics } from "../../utils/topicUtils";

/**
 * Shared building blocks for notification email distribution, used by the
 * fan-out and sender Lambdas (src/notification-delivery/). The actual
 * per-user send loop lives there now, via SQS, rather than here — see the
 * project's notification delivery architecture plan for why.
 */

/**
 * Notification ids/skeys are consistent between backend and frontend:
 * mirrors the frontend's makeSlug() (src/utils/utils.ts) exactly so links
 * in emails resolve on the site.
 */
export function buildNotificationUrl(title: string, id: string): string {
  const baseSlug = (title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return `${COGNITO_CONFIG.frontendUrl}/notification/${baseSlug}/${id}`;
}

/** Strips the "Notification#" prefix and "#META" suffix off a notification's META sk, leaving the bare id. */
export function getNotificationId(notificationSk: string): string {
  return notificationSk.replace(TABLE_PK_MAPPER.Notification, "").replace(NOTIFICATION_TYPE_MAPPER.META, "");
}

/** Builds the sk of a notification's #DISTRIBUTION log item from its META sk. */
export function getDistributionSk(notificationSk: string): string {
  return `${TABLE_PK_MAPPER.Notification}${getNotificationId(notificationSk)}${NOTIFICATION_TYPE_MAPPER.DISTRIBUTION}`;
}

/**
 * Same as getDistributionSk, but from a bare notification id rather than a
 * full META sk — used by the email sender service, which only has the id
 * (carried in the SQS job payload), not a META-suffixed sk.
 */
export function getDistributionSkFromId(id: string): string {
  return `${TABLE_PK_MAPPER.Notification}${id}${NOTIFICATION_TYPE_MAPPER.DISTRIBUTION}`;
}

/** Reads a notification's #DISTRIBUTION log item (email delivery status). Returns null if it doesn't exist yet (e.g. not yet approved). */
export async function getDistributionLog(notificationSk: string): Promise<IDistributionLog | null> {
  const sk = getDistributionSk(notificationSk);
  const item = await getItemFromDynamoDB({
    TableName: DYNAMODB_CONFIG.TABLE_NAME,
    Key: marshall({ pk: TABLE_PK_MAPPER.Notification, sk }),
  });
  return (item as IDistributionLog) || null;
}

/** No topics selected = no filter (receive everything), matching business rule defaults. */
export function matchesTopics(user: IUser, notification: INotification): boolean {
  if (!user.subscribed_topics || user.subscribed_topics.length === 0) return true;
  const topics = inferTopics(notification.title, notification.department);
  return topics.some((t) => user.subscribed_topics!.includes(t));
}

/** Capitalizes a hyphenated category slug for display, e.g. "admit-card" -> "Admit Card". Mirrors the frontend's formatCategoryTitle (src/utils/utils.ts). */
export function formatCategoryTitle(category?: string): string {
  return category?.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "";
}

/**
 * Formats last_date_to_apply for display in emails. Some notifications store
 * this as a raw epoch-ms string rather than a display string — detect and
 * convert those; anything else (an already-readable date string) passes
 * through unchanged.
 */
export function formatLastDateToApply(value?: string): string {
  if (!value) return "Not specified";
  if (/^\d+$/.test(value)) {
    const date = new Date(Number(value));
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
    }
  }
  return value;
}
