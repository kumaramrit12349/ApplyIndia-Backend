import "dotenv/config";

export const ENV = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
};

export const COGNITO_KEYS = {
  USER_POOL_ID: process.env.USER_POOL_ID,
  COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
  AWS_REGION: process.env.AWS_REGION,
}