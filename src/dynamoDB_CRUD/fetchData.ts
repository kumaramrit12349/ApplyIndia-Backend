import { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetItemCommand,
  QueryCommand,
  BatchGetItemCommand,
  GetItemCommandInput,
  GetItemCommandOutput,
  BatchGetItemCommandInput,
  BatchGetItemCommandOutput,
  KeysAndAttributes,
  QueryCommandInput,
  QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { handleErrorsAxios, logErrorLocation } from "../utils/errorUtils";
import { dynamoDBClient } from "../aws/dynamodb.client";
import { ARCHIVED } from "../db_schema/shared/SharedConstant";
import { IBatchGet } from "../db_schema/shared/SharedInterface";
import { DYNAMODB_CONFIG } from "../config/env";

export async function getItemFromDynamoDB(
  getItemParam: GetItemCommandInput,
): Promise<Record<string, any> | undefined> {
  try {
    const dynamoDB = new DynamoDBClient(dynamoDBClient);
    const data: GetItemCommandOutput = await dynamoDB.send(
      new GetItemCommand(getItemParam)
    );
    const item = data.Item ? unmarshall(data.Item) : undefined;
    return item;
    // return item?.is_archived ? undefined : item;
  } catch (error) {
    logErrorLocation(
      "fetchData.ts",
      "getItemFromDynamoDB",
      error,
      "Error while get item from DynamoDB",
      `learnerSK:`,
      { getItemParam }
    );
    handleErrorsAxios(error, {});
  }
}

export async function queryItemsFromDynamoDB<T>(
  queryPrams: QueryCommandInput,
  includeArchived: boolean = true
): Promise<T[]> {
  try {
    let result: QueryCommandOutput;
    let ExclusiveStartKey: Record<string, any> | undefined;
    queryPrams.ExpressionAttributeNames ??= {};
    queryPrams.ExpressionAttributeValues ??= {};
    /**
     * Apply archived filter ONLY when archived items
     * should be excluded
     */
    if (!includeArchived) {
      queryPrams.ExpressionAttributeNames[ARCHIVED.exprssionName] =
        ARCHIVED.is_archived;
      queryPrams.ExpressionAttributeValues[ARCHIVED.exprssionValue] =
        false as any;
      if (queryPrams.FilterExpression) {
        queryPrams.FilterExpression += ARCHIVED.filterExpression;
      } else {
        queryPrams.FilterExpression =
          ARCHIVED.filterExpression.substring(4);
      }
    }
    // Marshal after all mutations
    queryPrams.ExpressionAttributeValues = marshall(
      queryPrams.ExpressionAttributeValues
    );
    const accumulated: T[] = [];
    do {
      const params: QueryCommandInput = {
        ...queryPrams,
        ExclusiveStartKey,
      };
      const dynamoDB = new DynamoDBClient(dynamoDBClient);
      result = await dynamoDB.send(new QueryCommand(params));
      ExclusiveStartKey = result.LastEvaluatedKey;
      if (result.Items) {
        for (const item of result.Items) {
          accumulated.push(unmarshall(item) as T);
        }
      }
    } while (result.LastEvaluatedKey);
    return accumulated;
  } catch (error) {
    logErrorLocation(
      "fetchData.ts",
      "queryItemsFromDynamoDB",
      error,
      "Error while query items from DynamoDB",
      `learnerSK:`,
      { queryPrams }
    );
    handleErrorsAxios(error, {});
    return [];
  }
}

export async function queryItemsWithLimitDynamoDB<T>(
  queryPrams: QueryCommandInput,
  limit: number,
  startKey: Record<string, any>
): Promise<{ results: T[]; lastEvaluatedKey: Record<string, any> }> {
  try {
    if (!queryPrams?.ExpressionAttributeValues[ARCHIVED.exprssionValue]) {
      queryPrams.ExpressionAttributeValues[ARCHIVED.exprssionValue] =
        false as any; // as it is required to marshalled value here but we are marshalling below
      queryPrams.ExpressionAttributeNames[ARCHIVED.exprssionName] =
        ARCHIVED.is_archived;
    }
    if (queryPrams?.FilterExpression) {
      queryPrams.FilterExpression += ARCHIVED.filterExpression;
    } else {
      queryPrams.FilterExpression = ARCHIVED.filterExpression.substring(4);
    }
    queryPrams.ExpressionAttributeValues = marshall(
      queryPrams.ExpressionAttributeValues
    );
    const accumulated: T[] = [];
    const params: QueryCommandInput = {
      ...queryPrams,
      Limit: limit,
      ExclusiveStartKey: startKey ? marshall(startKey) : undefined,
    };
    const dynamoDB = new DynamoDBClient(DynamoDBClient);
    const result = await dynamoDB.send(new QueryCommand(params));
    if (result?.Items) {
      result.Items?.forEach((item) => {
        accumulated.push(unmarshall(item) as T);
      });
    }
    return {
      results: accumulated,
      lastEvaluatedKey: result.LastEvaluatedKey
        ? unmarshall(result.LastEvaluatedKey)
        : undefined,
    };
  } catch (error) {
    logErrorLocation(
      "fetchData.ts",
      "queryItemsWithLimitDynamoDB",
      error,
      "Error while query items from DynamoDB",
      `learnerSK:`,
      { queryPrams }
    );
    handleErrorsAxios(error, {});
  }
}

export async function batchGetItemsFromDynamoDB<
  T extends Record<string, any>
>(
  batchGetItemsParam: IBatchGet,
): Promise<T[]> {
  try {
    /* ------------------------------------
     * 2. Prepare ExpressionAttributeNames
     * ------------------------------------ */
    batchGetItemsParam.ExpressionAttributeNames ??= {};
    if (
      batchGetItemsParam.ProjectionExpression &&
      !batchGetItemsParam.ProjectionExpression.includes(
        ARCHIVED.is_archived
      )
    ) {
      batchGetItemsParam.ExpressionAttributeNames[
        ARCHIVED.exprssionName
      ] = ARCHIVED.is_archived;
      batchGetItemsParam.ProjectionExpression +=
        ARCHIVED.projectExpression;
    }
    /* ------------------------------------
     * 3. Marshall keys (DynamoDB limit = 100)
     * ------------------------------------ */
    const marshalledKeys: Record<string, AttributeValue>[] =
      batchGetItemsParam.Keys.map((key) =>
        marshall({ pk: key.pk, sk: key.sk })
      );
    const finalResult: T[] = [];
    /* ------------------------------------
     * 4. Process in batches of 100
     * ------------------------------------ */
    for (let i = 0; i < marshalledKeys.length; i += 100) {
      const Keys = marshalledKeys.slice(i, i + 100);
      let requestItems: Record<string, KeysAndAttributes> = {
        [DYNAMODB_CONFIG.TABLE_NAME]: {
          Keys,
          ProjectionExpression:
            batchGetItemsParam.ProjectionExpression,
          ExpressionAttributeNames:
            batchGetItemsParam.ExpressionAttributeNames,
        },
      };
      let unprocessedItems:
        | Record<string, KeysAndAttributes>
        | undefined;
      do {
        const params: BatchGetItemCommandInput = {
          RequestItems: unprocessedItems ?? requestItems,
        };
        const result: BatchGetItemCommandOutput =
          await dynamoDBClient.send(
            new BatchGetItemCommand(params)
          );
        const responses = result.Responses?.[DYNAMODB_CONFIG.TABLE_NAME];
        if (responses) {
          for (const response of responses) {
            const item = unmarshall(response) as T;
            // if (!item?.is_archived) {
            //   finalResult.push(item);
            // }
          }
        }
        unprocessedItems = result.UnprocessedKeys;
      } while (
        unprocessedItems &&
        Object.keys(unprocessedItems).length > 0
      );
    }
    return finalResult;
  } catch (error) {
    logErrorLocation(
      "fetchData.ts",
      "batchGetItemsFromDynamoDB",
      error,
      "Error while batch get items from DynamoDB",
      "",
      { batchGetItemsParam }
    );
    handleErrorsAxios(error, {});
    return [];
  }
}

