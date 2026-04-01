import {
  DeleteItemCommandInput,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { handleErrorsAxios, logErrorLocation } from "../utils/errorUtils";
import { DYNAMODB_CONFIG } from "../config/env";
import { dynamoDBClient } from "../aws/dynamodb.client";

export async function deleteItemDynamoDB(
  deleteItemParam: any,
): Promise<boolean> {
  try {
    const params: DeleteItemCommandInput = {
      TableName: DYNAMODB_CONFIG.TABLE_NAME,
      Key: marshall(deleteItemParam.Key),
    };
    const dynamoDB = new DynamoDBClient(dynamoDBClient);
    await dynamoDB.send(new DeleteItemCommand(params));
    return true;
  } catch (error) {
    logErrorLocation(
      "deleteData.ts",
      "deleteItemDynamoDB",
      error,
      "Error while deleting item DynamoDB",
      `learnerSK:`,
      { deleteItemParam }
    );
    handleErrorsAxios(error, {});
    return false;
  }
}
