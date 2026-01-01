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
  getItemParam: GetItemCommandInput
): Promise<Record<string, any> | undefined> {
  try {
    const dynamoDB = new DynamoDBClient(dynamoDBClient);
    const data: GetItemCommandOutput = await dynamoDB.send(
      new GetItemCommand(getItemParam)
    );
    const item = data.Item ? unmarshall(data.Item) : undefined;
    return item?.is_archived ? undefined : item;
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

export async function queryItemsFromDynamoDB<T extends Record<string, any>>(
  queryParams: QueryCommandInput
): Promise<T[]> {
  try {
    /* ------------------------------------
     * 1. Ensure optional fields exist
     * ------------------------------------ */
    queryParams.ExpressionAttributeValues ??= {};
    queryParams.ExpressionAttributeNames ??= {};
    /* ------------------------------------
     * 2. Add archived filter
     * ------------------------------------ */
    if (!queryParams.ExpressionAttributeValues[ARCHIVED.exprssionValue]) {
      queryParams.ExpressionAttributeValues[ARCHIVED.exprssionValue] =
        { BOOL: false } as AttributeValue;
      queryParams.ExpressionAttributeNames[ARCHIVED.exprssionName] =
        ARCHIVED.is_archived;
    }
    if (queryParams.FilterExpression) {
      queryParams.FilterExpression += ARCHIVED.filterExpression;
    } else {
      queryParams.FilterExpression =
        ARCHIVED.filterExpression.substring(4);
    }
    /* ------------------------------------
     * 3. Marshall ExpressionAttributeValues
     * ------------------------------------ */
    queryParams.ExpressionAttributeValues = marshall(
      queryParams.ExpressionAttributeValues
    );
    /* ------------------------------------
     * 4. Query with pagination
     * ------------------------------------ */
    const accumulated: T[] = [];
    let ExclusiveStartKey: Record<string, AttributeValue> | undefined;
    do {
      const params: QueryCommandInput = {
        ...queryParams,
        ExclusiveStartKey,
      };
      const result: QueryCommandOutput =
        await dynamoDBClient.send(new QueryCommand(params));

      if (result.Items) {
        for (const item of result.Items) {
          accumulated.push(unmarshall(item) as T);
        }
      }
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return accumulated;
  } catch (error) {
    logErrorLocation(
      "fetchData.ts",
      "queryItemsFromDynamoDB",
      error,
      "Error while querying items from DynamoDB",
      "",
      { queryParams }
    );
    handleErrorsAxios(error, {});
    return []; // TS safety (unreachable at runtime)
  }
}

export async function queryItemsWithLimitDynamoDB<
  T extends Record<string, any>
>(
  queryParams: QueryCommandInput,
  limit: number,
  startKey?: Record<string, any>
): Promise<{
  results: T[];
  lastEvaluatedKey?: Record<string, any>;
}> {
  try {
    /* ------------------------------------
     * 1. Ensure optional fields exist
     * ------------------------------------ */
    queryParams.ExpressionAttributeValues ??= {};
    queryParams.ExpressionAttributeNames ??= {};
    /* ------------------------------------
     * 2. Add archived filter
     * ------------------------------------ */
    if (!queryParams.ExpressionAttributeValues[ARCHIVED.exprssionValue]) {
      queryParams.ExpressionAttributeValues[ARCHIVED.exprssionValue] =
        { BOOL: false } as AttributeValue;
      queryParams.ExpressionAttributeNames[ARCHIVED.exprssionName] =
        ARCHIVED.is_archived;
    }
    if (queryParams.FilterExpression) {
      queryParams.FilterExpression += ARCHIVED.filterExpression;
    } else {
      queryParams.FilterExpression =
        ARCHIVED.filterExpression.substring(4);
    }
    /* ------------------------------------
     * 3. Marshall ExpressionAttributeValues
     * ------------------------------------ */
    queryParams.ExpressionAttributeValues = marshall(
      queryParams.ExpressionAttributeValues
    );
    /* ------------------------------------
     * 4. Build query params
     * ------------------------------------ */
    const params: QueryCommandInput = {
      ...queryParams,
      Limit: limit,
      ExclusiveStartKey: startKey
        ? marshall(startKey)
        : undefined,
    };
    /* ------------------------------------
     * 5. Execute query
     * ------------------------------------ */
    const result: QueryCommandOutput =
      await dynamoDBClient.send(new QueryCommand(params));
    /* ------------------------------------
     * 6. Unmarshall results
     * ------------------------------------ */
    const results: T[] = [];
    if (result.Items) {
      for (const item of result.Items) {
        results.push(unmarshall(item) as T);
      }
    }
    return {
      results,
      lastEvaluatedKey: result.LastEvaluatedKey
        ? unmarshall(result.LastEvaluatedKey)
        : undefined,
    };
  } catch (error) {
    logErrorLocation(
      "fetchData.ts",
      "queryItemsWithLimitDynamoDB",
      error,
      "Error while querying items from DynamoDB",
      "",
      { queryParams, limit, startKey }
    );

    handleErrorsAxios(error, {});
    return { results: [] }; // TS safety (unreachable at runtime)
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
            if (!item?.is_archived) {
              finalResult.push(item);
            }
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
    return []; // TS safety (unreachable at runtime)
  }
}

