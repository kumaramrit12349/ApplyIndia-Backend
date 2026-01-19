"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamoDBDocClient = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamodb_client_1 = require("./dynamodb.client");
exports.dynamoDBDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamodb_client_1.dynamoDBClient, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
        wrapNumbers: false,
    },
});
