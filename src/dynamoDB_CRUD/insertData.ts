import {
  PutItemCommand,
  PutItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { INSERT_ITEM_MAPPER, TABLE_PK_MAPPER } from "../db_schema/shared/SharedConstant";
import { TABLE_NAME_NOT_FOUND } from "../db_schema/shared/ErrorMessage";
import { generateId } from "../library/util";
import { dynamoDBClient } from "../aws/dynamodb.client";
import { handleErrorsAxios, logErrorLocation } from "../utils/errorUtils";
import { DYNAMODB_CONFIG } from "../config/env";

export async function insertItemIntoDynamoDB<T>(
  tableName: string,
  Item: T,
): Promise<{ pk: string; sk: string }> {
  try {
    if (tableName && !TABLE_PK_MAPPER[tableName]) {
      throw new Error(TABLE_NAME_NOT_FOUND);
    }
    const currentDate = new Date().getTime();
    Item[INSERT_ITEM_MAPPER.created_at] = currentDate;
    Item[INSERT_ITEM_MAPPER.modified_at] = currentDate;
    Item[INSERT_ITEM_MAPPER.pk] = TABLE_PK_MAPPER[tableName];
    Item[INSERT_ITEM_MAPPER.sk] = TABLE_PK_MAPPER[tableName] + generateId();
    const insertItem = marshall(Item, { removeUndefinedValues: true });
    const params: PutItemCommandInput = {
      TableName: DYNAMODB_CONFIG.TABLE_NAME,
      Item: insertItem,
      ReturnValues: "ALL_OLD",
    };
    const dynamoDB = new DynamoDBClient(dynamoDBClient);
    await dynamoDB.send(new PutItemCommand(params));
    return { pk: Item[INSERT_ITEM_MAPPER.pk], sk: Item[INSERT_ITEM_MAPPER.sk] };
  } catch (error) {
    logErrorLocation(
      "insertData.ts",
      "insertItemIntoDynamoDB",
      error,
      "Error while insert item into DynamoDB",
      `learnerSK:`,
      { tableName, Item }
    );
    handleErrorsAxios(error, {});
  }
}
