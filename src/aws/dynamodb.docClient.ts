import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "./dynamodb.client";

export const dynamoDBDocClient = DynamoDBDocumentClient.from(
  dynamoDBClient,
  {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  }
);
