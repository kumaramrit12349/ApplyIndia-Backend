import dotenv from "dotenv";
import path from "path";

// decide env (priority order)
const APP_ENV = process.env.APP_ENV || "local";
// resolve correct env file
const envPath = path.resolve(__dirname, `../env/${APP_ENV}.env`);
// load env file
dotenv.config({ path: envPath });
// ====== CONFIGS ======

export const ENV = {
  APP_ENV,
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  RUNTIME_ENV: process.env.RUNTIME_ENV,
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
  domain: process.env.COGNITO_DOMAIN!,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL!,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};

// ====== VALIDATION (VERY IMPORTANT) ======
if (!process.env.COGNITO_USER_POOL_ID) {
  throw new Error("COGNITO_USER_POOL_ID missing");
}