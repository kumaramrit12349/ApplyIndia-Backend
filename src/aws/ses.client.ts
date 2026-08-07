import { SESClient } from "@aws-sdk/client-ses";
import { AWS_CONFIG, ENV } from "../config/env";

export const sesClient = new SESClient(
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
