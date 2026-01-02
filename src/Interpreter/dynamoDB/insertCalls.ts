import { insertItemIntoDynamoDB } from "../../dynamoDB_CRUD/insertData";
import { handleErrorsAxios, logErrorLocation } from "../../utils/errorUtils";

export async function insertDataDynamoDB<T>(
  tableName: string,
  Item: T,
): Promise<{ pk: string; sk: string }> {
  try {
    return insertItemIntoDynamoDB<T>(tableName, Item);
  } catch (error) {
    logErrorLocation(
      "insertCalls.ts",
      "insertItemIntoDynamoDB",
      error,
      "Error while insert item into dynamoDB",
      `learnerSK:`,
      { tableName, Item }
    );
    handleErrorsAxios(error, {});
  }
}