import { sendEmailJobBatch } from "./notificationEmailSenderService";

/**
 * AWS Lambda handler for the `notificationEmailSender` function
 * (serverless.yml), triggered by SQS in batches (batchSize: 10) from the
 * notification-email-jobs queue. reservedConcurrency is capped in
 * serverless.yml to respect SES rate limits. Returns batchItemFailures
 * (functionResponseType: ReportBatchItemFailures) so SQS only retries the
 * specific messages that hit genuine errors, not the whole batch.
 */
export const handler = async (event: any): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> => {
  console.log("[NotificationEmailSenderLambda] Invoked at", new Date().toISOString(), "Records:", event?.Records?.length);
  return sendEmailJobBatch(event.Records || []);
};
