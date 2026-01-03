import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { AWS_CONFIG } from "../config/env";

export const dynamoDBClient = new DynamoDBClient({
  region: AWS_CONFIG.region,
  credentials: {
    accessKeyId: AWS_CONFIG.accessKeyId,
    secretAccessKey: AWS_CONFIG.secretAccessKey,
  },
  // Optional: safer defaults
  maxAttempts: 3,
});
