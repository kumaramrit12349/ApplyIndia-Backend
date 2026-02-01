import {
  NOTIFICATION,
  NOTIFICATION_TYPE,
} from "../../db_schema/Notification/NotificationConstant";
import { INotification } from "../../db_schema/Notification/NotificationInterface";
import {
  ALL_TABLE_NAME,
  NOTIFICATION_CATEGORIES,
  TABLE_PK_MAPPER,
} from "../../db_schema/shared/SharedConstant";
import { IKeyValues } from "../../db_schema/shared/SharedInterface";
import {
  fetchDynamoDB,
  fetchDynamoDBWithLimit,
} from "../../Interpreter/dynamoDB/fetchCalls";
import { logErrorLocation } from "../../utils/errorUtils";

// Fetch notifications for home page, filtered to approved (and non-archived when column exists),
// then group them by category for sections like Jobs, Results
export async function getHomePageNotifications(): Promise<
  Record<string, Array<{ title: string; sk: string }>>
> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAME.Notification,
      undefined,
      [
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.category,
        NOTIFICATION.created_at,
        NOTIFICATION.has_admit_card,
        NOTIFICATION.has_syllabus,
        NOTIFICATION.has_answer_key,
        NOTIFICATION.has_result,
        NOTIFICATION.approved_at,
        NOTIFICATION.approved_by,
        NOTIFICATION.type,
      ],
      {
        [NOTIFICATION.type]: NOTIFICATION_TYPE.META,
        [NOTIFICATION.approved_by]: "admin",
      },
      "#type = :type AND #approved_by = :approved_by",
      undefined,
      false // exclude archived
    );
    // Extra safety: ensure approved_at exists and is number
    const approved = items.filter((n) => typeof n.approved_at === "number");
    // Sort latest first
    approved.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    const grouped: Record<string, Array<{ title: string; sk: string }>> = {};
    const pushWithLimit = (
      key: string,
      item: { title: string; sk: string },
      limit = 10
    ) => {
      if (!grouped[key]) grouped[key] = [];
      if (grouped[key].length < limit) {
        grouped[key].push(item);
      }
    };
    for (const n of approved) {
      const sk = n
        .sk!.replace(`${TABLE_PK_MAPPER.Notification}`, "")
        .replace("#META", "");
      const baseItem = {
        title: n.title,
        sk,
      };
      // Primary category
      pushWithLimit(n.category || "Uncategorized", baseItem);
      // Virtual categories
      if (n.has_admit_card) {
        pushWithLimit(NOTIFICATION_CATEGORIES.ADMIT_CARD, baseItem);
      }
      if (n.has_syllabus) {
        pushWithLimit(NOTIFICATION_CATEGORIES.SYLLABUS, baseItem);
      }
      if (n.has_answer_key) {
        pushWithLimit(NOTIFICATION_CATEGORIES.ANSWER_KEY, baseItem);
      }
      if (n.has_result) {
        pushWithLimit(NOTIFICATION_CATEGORIES.RESULT, baseItem);
      }
    }
    return grouped;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getHomePageNotifications",
      error,
      "DB error while fetching home page notifications (DynamoDB)",
      "",
      {}
    );
    throw error;
  }
}

// List notifications by category with pagination and optional search,
export async function getNotificationsByCategory(
  category: string,
  limit: number,
  lastEvaluatedKeySk?: string, // ONLY sk from frontend
  searchValue?: string
): Promise<{
  data: Array<{ title: string; sk: string }>;
  lastEvaluatedKey?: string; // ONLY sk returned
}> {
  try {
    /* ================= PAGINATION ================= */
    let lastEvaluatedKey: { pk: string; sk: string } | undefined;
    if (lastEvaluatedKeySk) {
      // SAFETY CHECK
      if (!lastEvaluatedKeySk.includes("#")) {
        throw new Error("Invalid lastEvaluatedKeySk format");
      }
      const pkPrefix = lastEvaluatedKeySk.split("#")[0] + "#";
      lastEvaluatedKey = {
        pk: pkPrefix,
        sk: lastEvaluatedKeySk,
      };
    }
    const normalizedCategory = category?.toLowerCase() || "all";
    /* ================= BASE FILTER ================= */
    const queryFilter: IKeyValues = {
      type: NOTIFICATION_TYPE.META,
      approved_by: "admin",
    };
    let filterString = "#type=:type and #approved_by=:approved_by";
    /* ================= CATEGORY LOGIC ================= */
    const specialCategoryFlags: Record<string, string> = {
      [NOTIFICATION_CATEGORIES.ADMIT_CARD]: NOTIFICATION.has_admit_card,
      [NOTIFICATION_CATEGORIES.SYLLABUS]: NOTIFICATION.has_syllabus,
      [NOTIFICATION_CATEGORIES.ANSWER_KEY]: NOTIFICATION.has_answer_key,
      [NOTIFICATION_CATEGORIES.RESULT]: NOTIFICATION.has_result,
    };
    if (normalizedCategory !== "all") {
      const flag = specialCategoryFlags[normalizedCategory];
      if (flag) {
        queryFilter[flag] = true;
        filterString += ` and ${flag}=:${flag}`;
      } else {
        queryFilter.category = category;
        filterString += " and #category=:category";
      }
    }
    /* ================= SEARCH ================= */
    if (searchValue?.trim()) {
      queryFilter.title = searchValue;
      filterString += " and contains(title,:title)";
    }
    /* ================= QUERY ================= */
    const result = await fetchDynamoDBWithLimit<INotification>(
      ALL_TABLE_NAME.Notification,
      limit,
      lastEvaluatedKey,
      [
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.created_at,
        NOTIFICATION.category,
        NOTIFICATION.has_admit_card,
        NOTIFICATION.has_answer_key,
        NOTIFICATION.has_result,
        NOTIFICATION.has_syllabus,
        NOTIFICATION.type,
      ],
      queryFilter,
      filterString
    );
    /* ================= SORT ================= */
    result.results.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    /* ================= RESPONSE ================= */
    return {
      data: result.results.map((n) => ({
        title: n.title,
        sk: n
          .sk!.replace(`${TABLE_PK_MAPPER.Notification}`, "")
          .replace("#META", ""),
      })),
      lastEvaluatedKey: result.lastEvaluatedKey?.sk,
    };
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationsByCategory",
      error,
      "DB error while fetching notifications by category (DynamoDB)",
      "",
      { category, limit, lastEvaluatedKeySk, searchValue }
    );
    throw error;
  }
}
