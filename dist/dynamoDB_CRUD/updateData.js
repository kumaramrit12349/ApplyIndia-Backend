"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateItemDynamoDB = updateItemDynamoDB;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_dynamodb_2 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const SharedConstant_1 = require("../db_schema/shared/SharedConstant");
const errorUtils_1 = require("../utils/errorUtils");
const env_1 = require("../config/env");
const dynamodb_client_1 = require("../aws/dynamodb.client");
async function updateItemDynamoDB(updateItemParam) {
    try {
        updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.UpdateExpression] =
            updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.UpdateExpression] +
                ", " +
                `${SharedConstant_1.INSERT_ITEM_MAPPER.modified_at} = :${SharedConstant_1.INSERT_ITEM_MAPPER.modified_at}`;
        updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.ExpressionAttributeValues][`:${SharedConstant_1.INSERT_ITEM_MAPPER.modified_at}`] = new Date().getTime();
        updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.key] = (0, util_dynamodb_1.marshall)(updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.key]);
        updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.ExpressionAttributeValues] = (0, util_dynamodb_1.marshall)(updateItemParam[SharedConstant_1.DYNAMODB_KEYWORDS.ExpressionAttributeValues], { removeUndefinedValues: true });
        const params = {
            TableName: env_1.DYNAMODB_CONFIG.TABLE_NAME,
            ...updateItemParam,
        };
        const dynamoDB = new client_dynamodb_2.DynamoDBClient(dynamodb_client_1.dynamoDBClient);
        const data = await dynamoDB.send(new client_dynamodb_1.UpdateItemCommand(params));
        return (0, util_dynamodb_1.unmarshall)(data.Attributes);
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("updateData.ts", "updateItemDynamoDB", error, "Error while updating item DynamoDB", `learnerSK:`, { updateItemParam });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
