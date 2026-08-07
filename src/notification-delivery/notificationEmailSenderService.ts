import { TABLE_PK_MAPPER } from "../db_schema/shared/SharedConstant";
import { incrementDistributionChannelCounters } from "../Interpreter/dynamoDB/updateCalls";
import { getDistributionSkFromId } from "../services/private/notificationDistributionService";
import { sendEmail } from "../services/external/emailService";
import { logErrorLocation } from "../utils/errorUtils";

/**
 * Core logic for notificationEmailSenderLambda.ts. Consumes jobs enqueued by
 * notificationFanoutService.ts onto the notification-email-jobs SQS queue
 * and actually sends them via SES (through sendEmail()).
 */

/** One job = one already-rendered email to send to one recipient. */
interface EmailJobMessage {
  notificationId: string;
  to: string;
  subject: string;
  html: string;
}

interface SqsRecordLike {
  messageId: string;
  body: string;
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
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

/** Increments this notification's running sent/failed/skipped tally for the given outcome, keyed by notificationId. */
function recordJobOutcome(
  deltasByNotificationId: Map<string, { sent: number; failed: number; skipped: number }>,
  notificationId: string,
  outcome: "sent" | "failed" | "skipped"
): void {
  const current = deltasByNotificationId.get(notificationId) || { sent: 0, failed: 0, skipped: 0 };
  current[outcome]++;
  deltasByNotificationId.set(notificationId, current);
}

/**
 * Sends one SQS batch of email jobs (up to 10, per the email sender
 * Lambda's batchSize) with limited in-batch concurrency, then does ONE
 * atomic counter increment per distinct notificationId represented in the
 * batch — not one per message — since a batch may span several
 * notifications if approvals happen close together in time.
 *
 * Only genuine exceptions (a thrown error, not a normal {success:false} send
 * outcome) get reported as batch item failures, so SQS only retries messages
 * that hit real infra problems — a bad email address is data, not a retry.
 */
export async function sendEmailJobBatch(records: SqsRecordLike[]): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  const deltasByNotificationId = new Map<string, { sent: number; failed: number; skipped: number }>();

  await runWithConcurrency(records, 3, async (record) => {
    try {
      const job: EmailJobMessage = JSON.parse(record.body);
      const result = await sendEmail(job.to, job.subject, job.html);

      if (result.skipped) recordJobOutcome(deltasByNotificationId, job.notificationId, "skipped");
      else if (result.success) recordJobOutcome(deltasByNotificationId, job.notificationId, "sent");
      else recordJobOutcome(deltasByNotificationId, job.notificationId, "failed");
    } catch (error) {
      // Genuine infra/parse failure — let SQS redrive this specific message.
      logErrorLocation("notificationEmailSenderService.ts", "sendEmailJobBatch", error, "Email send job failed", "", { messageId: record.messageId });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  });

  const notificationPk = TABLE_PK_MAPPER.Notification;
  await Promise.all(
    Array.from(deltasByNotificationId.entries()).map(async ([notificationId, delta]) => {
      try {
        await incrementDistributionChannelCounters(notificationPk, getDistributionSkFromId(notificationId), "email", delta);
      } catch (error) {
        logErrorLocation("notificationEmailSenderService.ts", "sendEmailJobBatch (increment)", error, "Failed to increment distribution counters", "", {
          notificationId,
          delta,
        });
      }
    })
  );

  return { batchItemFailures };
}
