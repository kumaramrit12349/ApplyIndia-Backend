import { SendEmailCommand } from "@aws-sdk/client-ses";
import { sesClient } from "../../aws/ses.client";
import { EMAIL_CONFIG } from "../../config/env";
import { logErrorLocation } from "../../utils/errorUtils";
import { IExternalSendResult } from "./types";

/**
 * Sends an email via AWS SES. Requires SES_SENDER_EMAIL to be a
 * SES-verified sender identity (verify it in the SES console for the
 * configured AWS_REGION) — otherwise SES will reject the send.
 * No-ops (skipped) if EMAIL_CONFIG.senderAddress isn't set.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<IExternalSendResult> {
  if (!EMAIL_CONFIG.senderAddress) {
    return { success: false, skipped: true };
  }
  try {
    const result = await sesClient.send(
      new SendEmailCommand({
        Source: EMAIL_CONFIG.senderAddress,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Html: { Data: html, Charset: "UTF-8" } },
        },
      })
    );
    return { success: true, id: result.MessageId };
  } catch (error: any) {
    logErrorLocation("emailService.ts", "sendEmail", error, "Failed to send email via SES", "", { to, subject });
    return { success: false, error: error?.message || "SES send failed" };
  }
}
