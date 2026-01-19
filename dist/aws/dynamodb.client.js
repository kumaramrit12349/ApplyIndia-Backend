"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamoDBClient = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const env_1 = require("../config/env");
exports.dynamoDBClient = new client_dynamodb_1.DynamoDBClient(env_1.ENV.APP_ENV === "local"
    ? {
        region: env_1.AWS_CONFIG.region,
        credentials: {
            accessKeyId: env_1.AWS_CONFIG.accessKeyId,
            secretAccessKey: env_1.AWS_CONFIG.secretAccessKey,
        },
    }
    : {
        region: env_1.AWS_CONFIG.region,
        // 👈 NO credentials in Lambda
    });
