// src/utils/validateEnv.ts
import { DYNAMODB_CONFIG } from "../config/env";

export function validateEnv() {
if (!process.env.DYNAMODB_TABLE_NAME) {
  console.error("DYNAMODB_TABLE_NAME missing");
}
}
