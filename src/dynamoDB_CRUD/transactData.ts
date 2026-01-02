import {
  DynamoDBClient,
  TransactWriteItemsCommand,
  TransactWriteItem,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DYNAMODB_CONFIG } from "../config/env";
import { dynamoDBClient } from "../aws/dynamodb.client";
import { handleErrorsAxios, logErrorLocation } from "../utils/errorUtils";

export async function insertItemsIntoDynamoDBInBulk<T>(
  tableName: string,
  items: T[],
): Promise<void> {
  try {
    if (!items?.length) {
      throw new Error("No items provided for bulk insert");
    }

    const transactItems: TransactWriteItem[] = items.map((item) => ({
      Put: {
        TableName: DYNAMODB_CONFIG.TABLE_NAME,
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression:
          "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      },
    }));

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
