import { logErrorLocation } from "../../utils/errorUtils";
import { deleteItemDynamoDB } from "../../dynamoDB_CRUD/deleteData";

export async function deleteDynamoDB(
  pk: string,
  sk: string,
): Promise<boolean> {
  try {
    const params = {
      Key: {
        pk,
        sk,
      },
    };
    return await deleteItemDynamoDB(params);
  } catch (error) {
    logErrorLocation(
      "deleteCalls.ts",
      "deleteDynamoDB",
      error,
      "Error while deleting dynamoDB map",
      `learnerSK:`,
      { pk, sk }
    );
    return false;
  }
}
