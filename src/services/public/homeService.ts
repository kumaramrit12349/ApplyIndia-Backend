import {
  NOTIFICATION,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_MAPPER,
} from "../../db_schema/Notification/NotificationConstant";
import { INotification } from "../../db_schema/Notification/NotificationInterface";
import {
  ALL_TABLE_NAME,
  NOTIFICATION_CATEGORIES,
  TABLE_PK_MAPPER,
} from "../../db_schema/shared/SharedConstant";
import {
  fetchByIndexDynamoDB,
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
        NOTIFICATION.state,
        NOTIFICATION.created_at,
        NOTIFICATION.has_admit_card,
        NOTIFICATION.has_syllabus,
        NOTIFICATION.has_answer_key,
        NOTIFICATION.has_result,
        NOTIFICATION.approved_at,
        NOTIFICATION.type,
      ],
      {
        [NOTIFICATION.type]: NOTIFICATION_TYPE.META,
      },
      "#type = :type",
      undefined,
      false, // exclude archived
    );
    // Only show approved notifications (approved_at must be a valid timestamp)
    const approved = items.filter((n) => typeof n.approved_at === "number");
    // Sort latest first
    approved.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    const grouped: Record<string, Array<{ title: string; sk: string }>> = {};
    const pushWithLimit = (
      key: string,
      item: { title: string; sk: string },
      limit = 10,
    ) => {
      if (!grouped[key]) grouped[key] = [];
      if (grouped[key].length < limit) {
        grouped[key].push(item);
      }
    };
    for (const n of approved) {
      const sk = n
        .sk!.replace(`${TABLE_PK_MAPPER.Notification}`, "")
        .replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "");
      const baseItem = {
        title: n.title,
        sk,
        state: n.state,
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
      {},
    );
    throw error;
  }
}

// List notifications by category with pagination and optional search,
export async function getNotificationsByCategory(
  category: string,
  limit: number,
  lastEvaluatedKeySk?: string,
  searchValue?: string,
): Promise<{
  data: Array<{ title: string; sk: string }>;
  lastEvaluatedKey?: string;
}> {
  try {
    const normalizedCategory = category?.toLowerCase();

    if (!normalizedCategory) {
      throw new Error("Invalid category");
    }

    const search = searchValue?.trim()?.toLowerCase();

    let accumulated: INotification[] = [];
    let nextKey: any = undefined;

    /* ============================================================
       CASE 1: CATEGORY = ALL (Main Table Query)
       ============================================================ */
    if (normalizedCategory === "all") {
      let exclusiveStartKey = lastEvaluatedKeySk
        ? {
          pk: TABLE_PK_MAPPER.Notification,
          sk: lastEvaluatedKeySk,
        }
        : undefined;

      do {
        const result = await fetchDynamoDBWithLimit<INotification>(
          ALL_TABLE_NAME.Notification,
          limit,
          exclusiveStartKey,
          [
            NOTIFICATION.sk,
            NOTIFICATION.title,
            NOTIFICATION.created_at,
            NOTIFICATION.category,
            NOTIFICATION.type,
          ],
          { type: NOTIFICATION_TYPE.META },
          "#type = :type",
        );

        let items = result.results;

        if (search) {
          items = items.filter((item) =>
            item.title?.toLowerCase().includes(search),
          );
        }

        accumulated = accumulated.concat(items);

        exclusiveStartKey = result.lastEvaluatedKey;
        nextKey = result.lastEvaluatedKey;

      } while (
        accumulated.length < limit &&
        exclusiveStartKey
      );

      accumulated.sort(
        (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
      );

      return {
        data: accumulated.slice(0, limit).map((item) => ({
          title: item.title ?? "",
          sk:
            item.sk
              ?.replace(`${TABLE_PK_MAPPER.Notification}`, "")
              ?.replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "") ?? "",
        })),
        lastEvaluatedKey: nextKey?.sk,
      };
    }

    /* ============================================================
       CASE 2: CATEGORY SPECIFIC (GSI)
       ============================================================ */

    let exclusiveStartKey: Record<string, any> | undefined;

    do {
      const result = await fetchByIndexDynamoDB<INotification>({
        indexName: "categoryGsi",
        keyConditionExpression: "categoryPk = :category",
        expressionAttributeValues: {
          ":category":
            `${normalizedCategory}${NOTIFICATION_TYPE_MAPPER.META}`,
        },
        attributesToGet: [
          NOTIFICATION.sk,
          NOTIFICATION.title,
          NOTIFICATION.created_at,
          NOTIFICATION.category,
          NOTIFICATION.approved_at,
        ],
        limit,
        exclusiveStartKey,
        sortAscending: true,
      });

      let items = result.results;
      items = items?.filter(item => item.approved_at);
      if (search) {
        items = items.filter((item) =>
          item.title?.toLowerCase().includes(search),
        );
      }

      accumulated = accumulated.concat(items);

      exclusiveStartKey = result.lastEvaluatedKey;
      nextKey = result.lastEvaluatedKey;

    } while (
      accumulated.length < limit &&
      exclusiveStartKey
    );

    return {
      data: accumulated.slice(0, limit).map((item) => ({
        title: item.title ?? "",
        sk:
          item.sk
            ?.replace(`${TABLE_PK_MAPPER.Notification}`, "")
            ?.replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "") ?? "",
      })),
      lastEvaluatedKey: nextKey?.categorySk,
    };
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationsByCategory",
      error,
      "DB error while fetching notifications by category",
      "",
      { category, limit, lastEvaluatedKeySk, searchValue },
    );
  }
}

// List notifications by state with pagination and optional search,
export async function getNotificationsByState(
  state: string,
  limit: number,
  lastEvaluatedKeySk?: string,
  searchValue?: string,
): Promise<{
  data: Array<{ title: string; sk: string; state: string }>;
  lastEvaluatedKey?: string;
}> {
  try {
    const normalizedState = state?.toLowerCase();

    if (!normalizedState) {
      throw new Error("Invalid state");
    }

    const search = searchValue?.trim()?.toLowerCase();

    let accumulated: INotification[] = [];
    let nextKey: any = undefined;

    /* ============================================================
       CASE 1: STATE = ALL (Main Table Query)
       ============================================================ */
    if (normalizedState === "all") {
      let exclusiveStartKey = lastEvaluatedKeySk
        ? {
          pk: TABLE_PK_MAPPER.Notification,
          sk: lastEvaluatedKeySk,
        }
        : undefined;

      do {
        const result = await fetchDynamoDBWithLimit<INotification>(
          ALL_TABLE_NAME.Notification,
          limit,
          exclusiveStartKey,
          [
            NOTIFICATION.sk,
            NOTIFICATION.title,
            NOTIFICATION.created_at,
            NOTIFICATION.state,
            NOTIFICATION.type,
          ],
          { type: NOTIFICATION_TYPE.META },
          "#type = :type",
        );

        let items = result.results;

        if (search) {
          items = items.filter((item) =>
            item.title?.toLowerCase().includes(search),
          );
        }

        accumulated = accumulated.concat(items);

        exclusiveStartKey = result.lastEvaluatedKey;
        nextKey = result.lastEvaluatedKey;

      } while (
        accumulated.length < limit &&
        exclusiveStartKey
      );

      accumulated.sort(
        (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
      );

      return {
        data: accumulated.slice(0, limit).map((item) => ({
          title: item.title ?? "",
          state: item.state ?? "",
          sk:
            item.sk
              ?.replace(`${TABLE_PK_MAPPER.Notification}`, "")
              ?.replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "") ?? "",
        })),
        lastEvaluatedKey: nextKey?.sk,
      };
    }

    /* ============================================================
       CASE 2: STATE SPECIFIC (GSI)
       ============================================================ */

    let exclusiveStartKey: Record<string, any> | undefined;

    do {
      const result = await fetchByIndexDynamoDB<INotification>({
        indexName: "stateGsi",
        keyConditionExpression: "statePk = :state",
        expressionAttributeValues: {
          ":state":
            `${normalizedState}${NOTIFICATION_TYPE_MAPPER.META}`,
        },
        attributesToGet: [
          NOTIFICATION.sk,
          NOTIFICATION.title,
          NOTIFICATION.created_at,
          NOTIFICATION.state,
        ],
        limit,
        exclusiveStartKey,
        sortAscending: true,
      });

      let items = result.results;

      if (search) {
        items = items.filter((item) =>
          item.title?.toLowerCase().includes(search),
        );
      }

      accumulated = accumulated.concat(items);

      exclusiveStartKey = result.lastEvaluatedKey;
      nextKey = result.lastEvaluatedKey;

    } while (
      accumulated.length < limit &&
      exclusiveStartKey
    );

    return {
      data: accumulated.slice(0, limit).map((item) => ({
        title: item.title ?? "",
        state: item.state ?? "",
        sk:
          item.sk
            ?.replace(`${TABLE_PK_MAPPER.Notification}`, "")
            ?.replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "") ?? "",
      })),
      lastEvaluatedKey: nextKey?.stateSk,
    };
  } catch (error) {
    logErrorLocation(
      "homeService.ts",
      "getNotificationsByState",
      error,
      "DB error while fetching notifications by state",
      "",
      { state, limit, lastEvaluatedKeySk, searchValue },
    );
  }
}

// Fetch the 10 latest notifications across all categories
export async function getLatestNotifications(): Promise<
  Array<{ title: string; sk: string; state?: string; last_date_to_apply?: string }>
> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAME.Notification,
      undefined,
      [
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.created_at,
        NOTIFICATION.state,
        NOTIFICATION.approved_at,
        NOTIFICATION.type,
        NOTIFICATION.last_date_to_apply,
      ],
      {
        [NOTIFICATION.type]: NOTIFICATION_TYPE.META,
      },
      "#type = :type",
      undefined,
      false // exclude archived
    );

    // Only show approved notifications (approved_at must be a valid timestamp)
    const approved = items.filter((n) => typeof n.approved_at === "number");

    // Sort latest first
    approved.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

    // Take top 10
    const latest = approved.slice(0, 10).map((n) => {
      const sk = n
        .sk!.replace(`${TABLE_PK_MAPPER.Notification}`, "")
        .replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "");
      return {
        title: n.title || "",
        sk,
        state: n.state,
        last_date_to_apply: n.last_date_to_apply,
      };
    });

    return latest;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getLatestNotifications",
      error,
      "DB error while fetching latest notifications (DynamoDB)",
      "",
      {},
    );
    throw error;
  }
}

// Fetch available states that have at least one approved notification
export async function getAvailableFilters(): Promise<{ states: string[] }> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAME.Notification,
      undefined,
      [NOTIFICATION.state, NOTIFICATION.approved_at, NOTIFICATION.type],
      {
        [NOTIFICATION.type]: NOTIFICATION_TYPE.META,
      },
      "#type = :type",
      undefined,
      false // exclude archived
    );

    // Keep only approved ones
    const approved = items.filter((n) => typeof n.approved_at === "number");

    // Extract unique states
    const statesSet = new Set<string>();
    for (const item of approved) {
      if (item.state) {
        statesSet.add(item.state.toLowerCase());
      }
    }

    return { states: Array.from(statesSet) };
  } catch (error) {
    logErrorLocation(
      "homeService.ts",
      "getAvailableFilters",
      error,
      "DB error while fetching available filters",
      "",
      {},
    );
    throw error;
  }
}