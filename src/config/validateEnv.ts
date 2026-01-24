// src/utils/validateEnv.ts
import { DYNAMODB_CONFIG } from "../config/env";

export function validateEnv() {
    console.log('DYNAMODB_CONFIG.TABLE_NAME', DYNAMODB_CONFIG.TABLE_NAME);
  if (!DYNAMODB_CONFIG.TABLE_NAME) {

    throw new Error("DYNAMODB_TABLE_NAME is not defined");
  }
}
