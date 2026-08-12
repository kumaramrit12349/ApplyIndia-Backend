import { publishNotificationToTelegram } from "../services/private/socialPostService";

/**
 * AWS Lambda handler for the `notificationSocialPublisher` function
 * (serverless.yml), triggered by SQS messages on the notification-social
 * queue (batchSize: 1). Publishing to this queue is how
 * notificationService.ts's approveNotification() and the retry-social route
 * kick off Telegram publishing, instead of doing the work inline. All real
 * logic lives in socialPostService.ts.
 */
export const handler = async (event: any): Promise<void> => {
  console.log("[NotificationSocialLambda] Invoked at", new Date().toISOString(), "Records:", event?.Records?.length);

  for (const record of event.Records || []) {
    const { notificationId, mode } = JSON.parse(record.body);
    console.log("[NotificationSocialLambda] Processing", { notificationId, mode });
    try {
      await publishNotificationToTelegram(notificationId, mode);
    } catch (error) {
      console.error("[NotificationSocialLambda] Fatal error for notification", notificationId, error);
      // batchSize:1, so re-throwing lets SQS redrive/DLQ this specific message
      // rather than silently losing it.
      throw error;
    }
  }
};
