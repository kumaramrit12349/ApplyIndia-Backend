import {
  DynamoDBClient,
  TransactWriteItemsCommand,
  TransactWriteItem,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DYNAMODB_CONFIG } from "../config/env";
import { dynamoDBClient } from "../aws/dynamodb.client";
import { handleErrorsAxios, logErrorLocation } from "../utils/errorUtils";

export async function insertItemsIntoDynamoDBInBulk<T extends Record<string, any>>(
  tableName: string,
  items: T[],
): Promise<void> {
  try {
    if (!items?.length) {
      throw new Error("No items provided for bulk insert");
    }
    const now = Date.now();
    const transactItems: TransactWriteItem[] = items.map((item) => {
      // Do NOT mutate original object
      const itemWithTimestamps = {
        ...item,
        created_at: item.created_at ?? now, // only if missing
        modified_at: now,                   // always update
      };
      return {
        Put: {
          TableName: DYNAMODB_CONFIG.TABLE_NAME,
          Item: marshall(itemWithTimestamps, {
            removeUndefinedValues: true,
          }),
          ConditionExpression:
            "attribute_not_exists(pk) AND attribute_not_exists(sk)",
        },
      };
    });
    const dynamoDB = new DynamoDBClient(dynamoDBClient);
    await dynamoDB.send(
      new TransactWriteItemsCommand({
        TransactItems: transactItems,
      }),
    );
  } catch (error) {
    logErrorLocation(
      "insertBulkData.ts",
      "insertItemsIntoDynamoDBInBulk",
      error,
      "Error while bulk insert into DynamoDB",
      "",
      { tableName, items }
    );
    handleErrorsAxios(error, {});
  }
}
