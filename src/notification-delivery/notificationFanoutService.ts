import { SendMessageBatchCommand, SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs";
import { sqsClient } from "../aws/sqs.client";
import { QUEUE_CONFIG } from "../config/env";
import { TABLE_PK_MAPPER } from "../db_schema/shared/SharedConstant";
import { IUser } from "../db_schema/User/UserInterface";
import { INotification } from "../db_schema/Notification/NotificationInterface";
import { queryItemsWithLimitDynamoDB } from "../dynamoDB_CRUD/fetchData";
import { updateDynamoDB } from "../Interpreter/dynamoDB/updateCalls";
import { incrementDistributionChannelCounters, setDistributionTotalCount } from "../Interpreter/dynamoDB/updateCalls";
import { DYNAMODB_CONFIG } from "../config/env";
import { getNotificationById } from "../services/private/notificationService";
import {
  getDistributionLog,
  getDistributionSk,
  getNotificationId,
  buildNotificationUrl,
  matchesTopics,
  formatCategoryTitle,
  formatLastDateToApply,
} from "../services/private/notificationDistributionService";
import { renderEmailTemplate } from "../services/private/emailTemplateService";
import { EMAIL_TEMPLATE_KEYS } from "../db_schema/EmailTemplate/EmailTemplateConstant";
import { logErrorLocation } from "../utils/errorUtils";

/**
 * Core logic for src/notification-delivery/notificationFanoutLambda.ts (the
 * SQS-triggered entry point). Given one approved/retried notification, this
 * module figures out WHO should receive it by email, renders the content
 * once, and enqueues one delivery job per eligible user onto the email jobs
 * SQS queue — where notificationEmailSenderService.ts actually sends it.
 * This file never calls SES itself.
 */

/** Message shape enqueued onto the email jobs queue — one per recipient. */
interface EmailJobMessage {
  notificationId: string;
  to: string;
  subject: string;
  html: string;
}

/** Users are paged in batches of this size so memory stays bounded even for very large user tables. */
const PAGE_SIZE = 500;
/** How many SendMessageBatch calls (10 jobs each) run in parallel while enqueueing one page's jobs. */
const ENQUEUE_CONCURRENCY = 20;

/**
 * Runs `fn` over `items` with at most `limit` invocations in flight at once.
 * A minimal hand-rolled concurrency pool — no new dependency needed for this.
 */
async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    })
  );
}

/**
 * Sends `jobs` to `queueUrl` using batched SendMessageBatch calls (10
 * jobs/call, the SQS maximum), with limited concurrency across batches. A
 * no-op if the queue isn't configured (e.g. local dev without deployed
 * infra) or there's nothing to send.
 */
async function batchEnqueueDeliveryJobs(jobs: EmailJobMessage[], queueUrl: string | undefined): Promise<void> {
  if (jobs.length === 0 || !queueUrl) return;

  const chunks: EmailJobMessage[][] = [];
  for (let i = 0; i < jobs.length; i += 10) chunks.push(jobs.slice(i, i + 10));

  await runWithConcurrency(chunks, ENQUEUE_CONCURRENCY, async (chunk) => {
    const entries: SendMessageBatchRequestEntry[] = chunk.map((job, idx) => ({
      Id: `${idx}`,
      MessageBody: JSON.stringify(job),
    }));
    await sqsClient.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }));
  });
}

/**
 * Pages through the entire User# partition (bounded memory regardless of
 * table size — see queryItemsWithLimitDynamoDB, unlike a naive "load every
 * user into one array" approach), filters to users eligible for email
 * (opted in + topic match), and enqueues one delivery job per eligible user
 * who has an email on file onto the email jobs queue. Eligible users MISSING
 * an email are counted as "skipped" immediately rather than silently
 * dropped. Returns the total eligible-user count once enumeration finishes,
 * so the caller can record how many jobs to expect (see setDistributionTotalCount).
 */
async function enqueueEmailDeliveryJobs(
  notificationPk: string,
  distributionSk: string,
  notification: INotification,
  content: { subject: string; html: string }
): Promise<number> {
  let totalEligibleUsers = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;
  const queueUrl = QUEUE_CONFIG.notificationEmailJobsQueueUrl;

  do {
    const page = await queryItemsWithLimitDynamoDB<IUser>(
      {
        TableName: DYNAMODB_CONFIG.TABLE_NAME,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: { ":pk": TABLE_PK_MAPPER.User as any },
        ProjectionExpression: "sk, email, email_notifications, subscribed_topics",
      },
      PAGE_SIZE,
      lastEvaluatedKey as any
    );

    const usersInPage = page?.results || [];
    lastEvaluatedKey = page?.lastEvaluatedKey;

    const eligibleUsers = usersInPage.filter((u) => u.email_notifications !== false && matchesTopics(u, notification));

    const jobsForThisPage: EmailJobMessage[] = [];
    let usersMissingContactInfo = 0;
    for (const user of eligibleUsers) {
      if (!user.email) {
        usersMissingContactInfo++;
        continue;
      }
      jobsForThisPage.push({ notificationId: getNotificationId(notification.sk!), to: user.email, ...content });
    }

    await batchEnqueueDeliveryJobs(jobsForThisPage, queueUrl);
    if (usersMissingContactInfo > 0) {
      await incrementDistributionChannelCounters(notificationPk, distributionSk, "email", { sent: 0, failed: 0, skipped: usersMissingContactInfo });
    }

    totalEligibleUsers += eligibleUsers.length;
  } while (lastEvaluatedKey);

  return totalEligibleUsers;
}

/** Marks the email channel as failed outright (e.g. missing template) without ever enqueueing any delivery jobs. */
async function markEmailDeliveryFailed(notificationPk: string, distributionSk: string, error: string): Promise<void> {
  await updateDynamoDB(notificationPk, distributionSk, {
    email: { status: "failed", sent_count: 0, failed_count: 0, skipped_count: 0, total_count: 0, last_attempt_at: Date.now(), error },
  });
}

/**
 * Entry point called by notificationFanoutLambda.ts for one notification
 * approval (mode "initial") or one admin-triggered retry (mode "retry").
 *
 * - mode "initial": fans out email to every eligible user. Already-"sent" is
 *   left untouched (idempotent against duplicate SQS delivery of this event).
 * - mode "retry": only reprocesses if the email channel is currently at
 *   "failed" status — mirrors the pre-SQS retryDistribution()'s semantics,
 *   just now scale-safe.
 *
 * Email content always comes from the admin-managed "notification-approved"
 * EmailTemplate — there is no hardcoded fallback. A missing template marks
 * the email channel "failed" immediately (visible + retryable in the admin
 * panel) rather than sending placeholder copy.
 */
export async function fanOutNotificationToEligibleUsers(notificationId: string, mode: "initial" | "retry"): Promise<void> {
  const notification = await getNotificationById(notificationId);
  if (!notification || !notification.sk) {
    logErrorLocation("notificationFanoutService.ts", "fanOutNotificationToEligibleUsers", new Error("Notification not found"), "", "", { notificationId });
    return;
  }

  const notificationPk = TABLE_PK_MAPPER.Notification;
  const distributionSk = getDistributionSk(notification.sk);
  const existingLog = mode === "retry" ? await getDistributionLog(notification.sk) : null;
  if (mode === "retry" && existingLog?.email?.status !== "failed") return;
  if (mode === "initial" && existingLog?.email?.status === "sent") return;

  const notificationUrl = buildNotificationUrl(notification.title, notificationId);
  const renderedEmail = await renderEmailTemplate(EMAIL_TEMPLATE_KEYS.NOTIFICATION_APPROVED, {
    title: notification.title,
    category: formatCategoryTitle(notification.category),
    last_date_to_apply: formatLastDateToApply(notification.last_date_to_apply),
    url: notificationUrl,
  });
  if (!renderedEmail) {
    await markEmailDeliveryFailed(notificationPk, distributionSk, `No email template configured for key '${EMAIL_TEMPLATE_KEYS.NOTIFICATION_APPROVED}'`);
    return;
  }

  await updateDynamoDB(notificationPk, distributionSk, {
    email: { status: "pending", sent_count: 0, failed_count: 0, skipped_count: 0, last_attempt_at: Date.now() },
  });
  const totalEligible = await enqueueEmailDeliveryJobs(notificationPk, distributionSk, notification, renderedEmail);
  await setDistributionTotalCount(notificationPk, distributionSk, "email", totalEligible);
}
