import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { AWS_CONFIG, ENV } from "../config/env";

export const dynamoDBClient = new DynamoDBClient(
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
        // 👈 NO credentials in Lambda
      },
);
