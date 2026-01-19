"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AURORA_CONFIG = exports.COGNITO_CONFIG = exports.DYNAMODB_CONFIG = exports.AWS_CONFIG = exports.ENV = void 0;
exports.ENV = {
    APP_ENV: process.env.APP_ENV || "dev",
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: Number(process.env.PORT) || 5000,
};
exports.AWS_CONFIG = {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
exports.DYNAMODB_CONFIG = {
    TABLE_NAME: process.env.DYNAMODB_TABLE_NAME,
};
exports.COGNITO_CONFIG = {
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    region: process.env.AWS_REGION,
};
// Temporary (until full DynamoDB migration)
exports.AURORA_CONFIG = {
    HOST: process.env.AURORA_HOST,
    USER: process.env.AURORA_USER,
    PASSWORD: process.env.AURORA_PASSWORD,
    DB: process.env.AURORA_DB,
    PORT: Number(process.env.AURORA_PORT),
};
