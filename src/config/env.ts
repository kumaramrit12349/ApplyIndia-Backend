export const ENV = {
  APP_ENV: process.env.APP_ENV || "dev",
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
};

export const AWS_CONFIG = {
  region: process.env.AWS_REGION!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

export const DYNAMODB_CONFIG = {
  TABLE_NAME: process.env.DYNAMODB_TABLE_NAME,
};

export const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  region: process.env.AWS_REGION!,
};

// Temporary (until full DynamoDB migration)
export const AURORA_CONFIG = {
  HOST: process.env.AURORA_HOST,
  USER: process.env.AURORA_USER,
  PASSWORD: process.env.AURORA_PASSWORD,
  DB: process.env.AURORA_DB,
  PORT: Number(process.env.AURORA_PORT),
};
