"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertItemsIntoDynamoDBInBulk = insertItemsIntoDynamoDBInBulk;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const env_1 = require("../config/env");
const dynamodb_client_1 = require("../aws/dynamodb.client");
const errorUtils_1 = require("../utils/errorUtils");
async function insertItemsIntoDynamoDBInBulk(tableName, items) {
    try {
        if (!items?.length) {
            throw new Error("No items provided for bulk insert");
        }
        const now = Date.now();
        const transactItems = items.map((item) => {
            // 🔑 Do NOT mutate original object
            const itemWithTimestamps = {
                ...item,
                created_at: item.created_at ?? now, // only if missing
                modified_at: now, // always update
            };
            return {
                Put: {
                    TableName: env_1.DYNAMODB_CONFIG.TABLE_NAME,
                    Item: (0, util_dynamodb_1.marshall)(itemWithTimestamps, {
                        removeUndefinedValues: true,
                    }),
                    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
                },
            };
        });
        const dynamoDB = new client_dynamodb_1.DynamoDBClient(dynamodb_client_1.dynamoDBClient);
        await dynamoDB.send(new client_dynamodb_1.TransactWriteItemsCommand({
            TransactItems: transactItems,
        }));
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("insertBulkData.ts", "insertItemsIntoDynamoDBInBulk", error, "Error while bulk insert into DynamoDB", "", { tableName, items });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
