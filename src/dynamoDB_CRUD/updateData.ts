import {
  UpdateItemCommandInput,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DYNAMODB_KEYWORDS, INSERT_ITEM_MAPPER } from "../db_schema/shared/SharedConstant";
import { handleErrorsAxios, logErrorLocation } from "../utils/errorUtils";
import { DYNAMODB_CONFIG } from "../config/env";
import { dynamoDBClient } from "../aws/dynamodb.client";

export async function updateItemDynamoDB(
  updateItemParam: any,
): Promise<Record<string, any>> {
  try {
    updateItemParam[DYNAMODB_KEYWORDS.UpdateExpression] =
      updateItemParam[DYNAMODB_KEYWORDS.UpdateExpression] +
      ", " +
      `${INSERT_ITEM_MAPPER.modified_at} = :${INSERT_ITEM_MAPPER.modified_at}`;
    updateItemParam[DYNAMODB_KEYWORDS.ExpressionAttributeValues][
      `:${INSERT_ITEM_MAPPER.modified_at}`
    ] = new Date().getTime();
    updateItemParam[DYNAMODB_KEYWORDS.key] = marshall(
      updateItemParam[DYNAMODB_KEYWORDS.key]
    );
    updateItemParam[DYNAMODB_KEYWORDS.ExpressionAttributeValues] = marshall(
      updateItemParam[DYNAMODB_KEYWORDS.ExpressionAttributeValues],
      { removeUndefinedValues: true }
    );
    const params: UpdateItemCommandInput = {
      TableName: DYNAMODB_CONFIG.TABLE_NAME,
      ...updateItemParam,
    };
    const dynamoDB = new DynamoDBClient(dynamoDBClient);
    const data = await dynamoDB.send(new UpdateItemCommand(params));
    return unmarshall(data.Attributes);
  } catch (error) {
    logErrorLocation(
      "updateData.ts",
      "updateItemDynamoDB",
      error,
      "Error while updating item DynamoDB",
      `learnerSK:`,
      { updateItemParam }
    );
    handleErrorsAxios(error, {});
  }
}
