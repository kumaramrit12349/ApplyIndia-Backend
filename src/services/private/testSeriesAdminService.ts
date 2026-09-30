import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { ITestSeries } from "../../db_schema/TestSeries/TestSeriesInterface";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { logErrorLocation } from "../../utils/errorUtils";
import { listMockTestsBySeries, deleteMockTestCascade } from "./mockTestAdminService";

export async function createTestSeries(input: Omit<ITestSeries, "pk" | "sk">): Promise<ITestSeries> {
  const item: ITestSeries = { ...input };
  const { sk } = await insertDataDynamoDB(ALL_TABLE_NAMES.TestSeries, item);
  return { ...item, pk: TABLE_PK_MAPPER.TestSeries, sk };
}

/** Admin-facing list — every series regardless of publish state. Full scan is fine at this feature's expected volume (a handful of exams, not thousands). */
export async function listAllTestSeries(): Promise<ITestSeries[]> {
  return fetchDynamoDB<ITestSeries>(ALL_TABLE_NAMES.TestSeries, undefined, ["*"]);
}

export async function getTestSeriesBySk(sk: string): Promise<ITestSeries | null> {
  const results = await fetchDynamoDB<ITestSeries>(ALL_TABLE_NAMES.TestSeries, sk);
  return results[0] || null;
}

export async function updateTestSeries(sk: string, updates: Partial<ITestSeries>): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.TestSeries, sk, updates);
}

export async function publishTestSeries(sk: string, isPublished: boolean): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.TestSeries, sk, { is_published: isPublished });
}

/**
 * Cascades to every MockTest (and each test's own Question sub-items) that
 * belongs to this series before removing the series row itself — otherwise
 * deleting a series would orphan its tests under a series_id that no longer
 * resolves to anything.
 */
export async function deleteTestSeriesCascade(sk: string): Promise<void> {
  try {
    const tests = await listMockTestsBySeries(sk);
    await Promise.all(tests.map((t) => deleteMockTestCascade(t.sk!)));
    await deleteDynamoDB(TABLE_PK_MAPPER.TestSeries, sk);
  } catch (error) {
    logErrorLocation("testSeriesAdminService.ts", "deleteTestSeriesCascade", error, "Error deleting test series", "", { sk });
    throw error;
  }
}
