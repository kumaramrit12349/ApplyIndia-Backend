import { SQSClient } from "@aws-sdk/client-sqs";
import { AWS_CONFIG, ENV } from "../config/env";

export const sqsClient = new SQSClient(
  ENV.APP_ENV === "local"
    ? {
        region: AWS_CONFIG.region,
        credentials: {
          accessKeyId: AWS_CONFIG.accessKeyId!,
          secretAccessKey: AWS_CONFIG.secretAccessKey!,
        },
      }
    : {
        region: AWS_CONFIG.region,
      },
);
