import { fanOutNotificationToEligibleUsers } from "./notificationFanoutService";

/**
 * AWS Lambda handler for the `notificationFanout` function (serverless.yml),
 * triggered by SQS messages on the notification-fanout queue (batchSize: 1
 * — one notification approval/retry per invocation). Publishing to this
 * queue is how notificationService.ts's approveNotification() and the
 * retry-distribution route kick off delivery, instead of doing the work
 * inline. All real logic lives in notificationFanoutService.ts.
 */
export const handler = async (event: any): Promise<void> => {
  console.log("[NotificationFanoutLambda] Invoked at", new Date().toISOString(), "Records:", event?.Records?.length);

  for (const record of event.Records || []) {
    const { notificationId, mode } = JSON.parse(record.body);
    console.log("[NotificationFanoutLambda] Processing", { notificationId, mode });
    try {
      await fanOutNotificationToEligibleUsers(notificationId, mode);
    } catch (error) {
      console.error("[NotificationFanoutLambda] Fatal error for notification", notificationId, error);
      // batchSize:1, so re-throwing lets SQS redrive/DLQ this specific message
      // rather than silently losing the whole fan-out run.
      throw error;
    }
  }
};
