"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertItemIntoDynamoDB = insertItemIntoDynamoDB;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_dynamodb_2 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const SharedConstant_1 = require("../db_schema/shared/SharedConstant");
const ErrorMessage_1 = require("../db_schema/shared/ErrorMessage");
const util_1 = require("../library/util");
const dynamodb_client_1 = require("../aws/dynamodb.client");
const errorUtils_1 = require("../utils/errorUtils");
const env_1 = require("../config/env");
async function insertItemIntoDynamoDB(tableName, Item) {
    try {
        if (tableName && !SharedConstant_1.TABLE_PK_MAPPER[tableName]) {
            throw new Error(ErrorMessage_1.TABLE_NAME_NOT_FOUND);
        }
        const currentDate = new Date().getTime();
        Item[SharedConstant_1.INSERT_ITEM_MAPPER.created_at] = currentDate;
        Item[SharedConstant_1.INSERT_ITEM_MAPPER.modified_at] = currentDate;
        Item[SharedConstant_1.INSERT_ITEM_MAPPER.pk] = SharedConstant_1.TABLE_PK_MAPPER[tableName];
        Item[SharedConstant_1.INSERT_ITEM_MAPPER.sk] = SharedConstant_1.TABLE_PK_MAPPER[tableName] + (0, util_1.generateId)();
        const insertItem = (0, util_dynamodb_1.marshall)(Item, { removeUndefinedValues: true });
        const params = {
            TableName: env_1.DYNAMODB_CONFIG.TABLE_NAME,
            Item: insertItem,
            ReturnValues: "ALL_OLD",
        };
        const dynamoDB = new client_dynamodb_2.DynamoDBClient(dynamodb_client_1.dynamoDBClient);
        await dynamoDB.send(new client_dynamodb_1.PutItemCommand(params));
        return { pk: Item[SharedConstant_1.INSERT_ITEM_MAPPER.pk], sk: Item[SharedConstant_1.INSERT_ITEM_MAPPER.sk] };
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("insertData.ts", "insertItemIntoDynamoDB", error, "Error while insert item into DynamoDB", `learnerSK:`, { tableName, Item, });
        (0, errorUtils_1.handleErrorsAxios)(error, {});
    }
}
