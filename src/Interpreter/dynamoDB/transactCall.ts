import { insertItemsIntoDynamoDBInBulk } from "../../dynamoDB_CRUD/transactData";
import { handleErrorsAxios, logErrorLocation } from "../../utils/errorUtils";

export async function insertBulkDataDynamoDB<T>(
  tableName: string,
  items: T[],
): Promise<void> {
  try {
    return insertItemsIntoDynamoDBInBulk<T>(tableName, items);
  } catch (error) {
    logErrorLocation(
      "insertCalls.ts",
      "insertBulkDataDynamoDB",
      error,
      "Error while bulk insert into dynamoDB",
      "",
      { tableName, items }
    );
    handleErrorsAxios(error, {});
  }
}
