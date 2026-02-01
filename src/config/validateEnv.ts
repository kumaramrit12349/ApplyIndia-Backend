export function validateEnv() {
if (!process.env.DYNAMODB_TABLE_NAME) {
  console.error("DYNAMODB_TABLE_NAME missing");
}
}
