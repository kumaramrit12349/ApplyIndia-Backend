"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getItemFromDynamoDB = getItemFromDynamoDB;
exports.queryItemsFromDynamoDB = queryItemsFromDynamoDB;
exports.queryItemsWithLimitDynamoDB = queryItemsWithLimitDynamoDB;
exports.batchGetItemsFromDynamoDB = batchGetItemsFromDynamoDB;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_dynamodb_2 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const errorUtils_1 = require("../utils/errorUtils");
const dynamodb_client_1 = require("../aws/dynamodb.client");
const SharedConstant_1 = require("../db_schema/shared/SharedConstant");
const env_1 = require("../config/env");
async function getItemFromDynamoDB(getItemParam) {
    try {
        const dynamoDB = new client_dynamodb_1.DynamoDBClient(dynamodb_client_1.dynamoDBClient);
        const data = await dynamoDB.send(new client_dynamodb_2.GetItemCommand(getItemParam));
        const item = data.Item ? (0, util_dynamodb_1.unmarshall)(data.Item) : undefined;
        return item;
        // return item?.is_archived ? undefined : item;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("fetchData.ts", "getItemFromDynamoDB", error, "Error while get item from DynamoDB", `learnerSK:`, { getItemParam });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
async function queryItemsFromDynamoDB(queryPrams, includeArchived = true) {
    try {
        let result;
        let ExclusiveStartKey;
        queryPrams.ExpressionAttributeNames ?? (queryPrams.ExpressionAttributeNames = {});
        queryPrams.ExpressionAttributeValues ?? (queryPrams.ExpressionAttributeValues = {});
        /**
         * Apply archived filter ONLY when archived items
         * should be excluded
         */
        if (!includeArchived) {
            queryPrams.ExpressionAttributeNames[SharedConstant_1.ARCHIVED.exprssionName] =
                SharedConstant_1.ARCHIVED.is_archived;
            queryPrams.ExpressionAttributeValues[SharedConstant_1.ARCHIVED.exprssionValue] =
                false;
            if (queryPrams.FilterExpression) {
                queryPrams.FilterExpression += SharedConstant_1.ARCHIVED.filterExpression;
            }
            else {
                queryPrams.FilterExpression =
                    SharedConstant_1.ARCHIVED.filterExpression.substring(4);
            }
        }
        // Marshal after all mutations
        queryPrams.ExpressionAttributeValues = (0, util_dynamodb_1.marshall)(queryPrams.ExpressionAttributeValues);
        const accumulated = [];
        do {
            const params = {
                ...queryPrams,
                ExclusiveStartKey,
            };
            const dynamoDB = new client_dynamodb_1.DynamoDBClient(dynamodb_client_1.dynamoDBClient);
            result = await dynamoDB.send(new client_dynamodb_2.QueryCommand(params));
            ExclusiveStartKey = result.LastEvaluatedKey;
            if (result.Items) {
                for (const item of result.Items) {
                    accumulated.push((0, util_dynamodb_1.unmarshall)(item));
                }
            }
        } while (result.LastEvaluatedKey);
        return accumulated;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("fetchData.ts", "queryItemsFromDynamoDB", error, "Error while query items from DynamoDB", `learnerSK:`, { queryPrams });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
        return [];
    }
}
async function queryItemsWithLimitDynamoDB(queryPrams, limit, startKey) {
    try {
        if (!queryPrams?.ExpressionAttributeValues[SharedConstant_1.ARCHIVED.exprssionValue]) {
            queryPrams.ExpressionAttributeValues[SharedConstant_1.ARCHIVED.exprssionValue] =
                false; // as it is required to marshalled value here but we are marshalling below
            queryPrams.ExpressionAttributeNames[SharedConstant_1.ARCHIVED.exprssionName] =
                SharedConstant_1.ARCHIVED.is_archived;
        }
        if (queryPrams?.FilterExpression) {
            queryPrams.FilterExpression += SharedConstant_1.ARCHIVED.filterExpression;
        }
        else {
            queryPrams.FilterExpression = SharedConstant_1.ARCHIVED.filterExpression.substring(4);
        }
        queryPrams.ExpressionAttributeValues = (0, util_dynamodb_1.marshall)(queryPrams.ExpressionAttributeValues);
        const accumulated = [];
        const params = {
            ...queryPrams,
            Limit: limit,
            ExclusiveStartKey: startKey ? (0, util_dynamodb_1.marshall)(startKey) : undefined,
        };
        const dynamoDB = new client_dynamodb_1.DynamoDBClient(client_dynamodb_1.DynamoDBClient);
        const result = await dynamoDB.send(new client_dynamodb_2.QueryCommand(params));
        if (result?.Items) {
            result.Items?.forEach((item) => {
                accumulated.push((0, util_dynamodb_1.unmarshall)(item));
            });
        }
        return {
            results: accumulated,
            lastEvaluatedKey: result.LastEvaluatedKey
                ? (0, util_dynamodb_1.unmarshall)(result.LastEvaluatedKey)
                : undefined,
        };
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("fetchData.ts", "queryItemsWithLimitDynamoDB", error, "Error while query items from DynamoDB", `learnerSK:`, { queryPrams });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
async function batchGetItemsFromDynamoDB(batchGetItemsParam) {
    try {
        /* ------------------------------------
         * 2. Prepare ExpressionAttributeNames
         * ------------------------------------ */
        batchGetItemsParam.ExpressionAttributeNames ?? (batchGetItemsParam.ExpressionAttributeNames = {});
        if (batchGetItemsParam.ProjectionExpression &&
            !batchGetItemsParam.ProjectionExpression.includes(SharedConstant_1.ARCHIVED.is_archived)) {
            batchGetItemsParam.ExpressionAttributeNames[SharedConstant_1.ARCHIVED.exprssionName] = SharedConstant_1.ARCHIVED.is_archived;
            batchGetItemsParam.ProjectionExpression +=
                SharedConstant_1.ARCHIVED.projectExpression;
        }
        /* ------------------------------------
         * 3. Marshall keys (DynamoDB limit = 100)
         * ------------------------------------ */
        const marshalledKeys = batchGetItemsParam.Keys.map((key) => (0, util_dynamodb_1.marshall)({ pk: key.pk, sk: key.sk }));
        const finalResult = [];
        /* ------------------------------------
         * 4. Process in batches of 100
         * ------------------------------------ */
        for (let i = 0; i < marshalledKeys.length; i += 100) {
            const Keys = marshalledKeys.slice(i, i + 100);
            let requestItems = {
                [env_1.DYNAMODB_CONFIG.TABLE_NAME]: {
                    Keys,
                    ProjectionExpression: batchGetItemsParam.ProjectionExpression,
                    ExpressionAttributeNames: batchGetItemsParam.ExpressionAttributeNames,
                },
            };
            let unprocessedItems;
            do {
                const params = {
                    RequestItems: unprocessedItems ?? requestItems,
                };
                const result = await dynamodb_client_1.dynamoDBClient.send(new client_dynamodb_2.BatchGetItemCommand(params));
                const responses = result.Responses?.[env_1.DYNAMODB_CONFIG.TABLE_NAME];
                if (responses) {
                    for (const response of responses) {
                        const item = (0, util_dynamodb_1.unmarshall)(response);
                        // if (!item?.is_archived) {
                        //   finalResult.push(item);
                        // }
                    }
                }
                unprocessedItems = result.UnprocessedKeys;
            } while (unprocessedItems &&
                Object.keys(unprocessedItems).length > 0);
        }
        return finalResult;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("fetchData.ts", "batchGetItemsFromDynamoDB", error, "Error while batch get items from DynamoDB", "", { batchGetItemsParam });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
        return []; // TS safety (unreachable at runtime)
    }
}
