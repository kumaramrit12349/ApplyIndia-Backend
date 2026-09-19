import {
  NOTIFICATION,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_MAPPER,
} from "../../db_schema/Notification/NotificationConstant";
import { INotification } from "../../db_schema/Notification/NotificationInterface";
import {
  ALL_TABLE_NAMES,
  NOTIFICATION_CATEGORIES,
  TABLE_PK_MAPPER,
} from "../../db_schema/shared/SharedConstant";
import {
  fetchByIndexDynamoDB,
  fetchDynamoDB,
  fetchDynamoDBWithLimit,
} from "../../Interpreter/dynamoDB/fetchCalls";
import { logErrorLocation } from "../../utils/errorUtils";
import { getNotificationById } from "../private/notificationService";
import { resolveStateCode } from "../../utils/stateUtils";

// Fetch notifications for home page, filtered to approved (and non-archived when column exists),
// then group them by category for sections like Jobs, Results
/**
 * Fetches the homepage's category-grouped notifications, personalized by state.
 *
 * @param stateFilter - "all" shows every state (unfiltered); a state code
 *   (e.g. "br") shows Central + that state; undefined/empty shows Central
 *   only (the default for anonymous visitors and users with no state set).
 */
export async function getHomePageNotifications(stateFilter?: string): Promise<
  Record<
    string,
    Array<{
      title: string;
      sk: string;
      state?: string;
      last_date_to_apply?: string;
      created_at?: number;
    }>
  >
> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAMES.Notification,
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
        NOTIFICATION.last_date_to_apply,
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

    // Personalize by state: Central is always included; a specific state
    // adds that state's notifications too; "all" disables filtering.
    // Both sides of the comparison are canonicalized to the same
    // INDIAN_STATES code first (see resolveStateCode).
    const isAllStates = stateFilter?.trim().toLowerCase() === "all";
    const requestedCode = isAllStates ? undefined : resolveStateCode(stateFilter);
    const scoped = isAllStates
      ? approved
      : approved.filter((n) => {
          const code = resolveStateCode(n.state);
          return code === "CT" || (!!requestedCode && code === requestedCode);
        });

    const grouped: Record<
      string,
      Array<{
        title: string;
        sk: string;
        state?: string;
        last_date_to_apply?: string;
        created_at?: number;
      }>
    > = {};
    const pushWithLimit = (
      key: string,
      item: {
        title: string;
        sk: string;
        state?: string;
        last_date_to_apply?: string;
        created_at?: number;
      },
      limit = 10,
    ) => {
      if (!grouped[key]) grouped[key] = [];
      if (grouped[key].length < limit) {
        grouped[key].push(item);
      }
    };
    for (const n of scoped) {
      const sk = n
        .sk!.replace(`${TABLE_PK_MAPPER.Notification}`, "")
        .replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "");
      const baseItem = {
        title: n.title,
        sk,
        state: n.state,
        last_date_to_apply: n.last_date_to_apply,
        created_at: n.created_at,
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
  data: Array<{ title: string; sk: string; last_date_to_apply?: string }>;
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

    let exclusiveStartKey: Record<string, any> | undefined;
    if (lastEvaluatedKeySk) {
      try {
        exclusiveStartKey = JSON.parse(
          Buffer.from(lastEvaluatedKeySk, "base64").toString("utf-8")
        );
      } catch (err) {
        if (normalizedCategory === "all") {
          exclusiveStartKey = {
            pk: TABLE_PK_MAPPER.Notification,
            sk: lastEvaluatedKeySk,
          };
        }
      }
    }

    /* ============================================================
       CASE 1: CATEGORY = ALL (Main Table Query)
       ============================================================ */
    if (normalizedCategory === "all") {
      do {
        const result = await fetchDynamoDBWithLimit<INotification>(
          ALL_TABLE_NAMES.Notification,
          limit,
          exclusiveStartKey,
          [
            NOTIFICATION.sk,
            NOTIFICATION.title,
            NOTIFICATION.created_at,
            NOTIFICATION.category,
            NOTIFICATION.type,
            NOTIFICATION.last_date_to_apply,
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
          last_date_to_apply: item.last_date_to_apply,
        })),
        lastEvaluatedKey: nextKey
          ? Buffer.from(JSON.stringify(nextKey)).toString("base64")
          : undefined,
      };
    }

    /* ============================================================
       CASE 2: CATEGORY SPECIFIC (GSI)
       ============================================================ */

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
          NOTIFICATION.last_date_to_apply,
        ],
        limit,
        exclusiveStartKey,
        sortAscending: false,
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
        last_date_to_apply: item.last_date_to_apply,
      })),
      lastEvaluatedKey: nextKey
        ? Buffer.from(JSON.stringify(nextKey)).toString("base64")
        : undefined,
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
  data: Array<{ title: string; sk: string; state: string; last_date_to_apply?: string }>;
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

    let exclusiveStartKey: Record<string, any> | undefined;
    if (lastEvaluatedKeySk) {
      try {
        exclusiveStartKey = JSON.parse(
          Buffer.from(lastEvaluatedKeySk, "base64").toString("utf-8")
        );
      } catch (err) {
        if (normalizedState === "all") {
          exclusiveStartKey = {
            pk: TABLE_PK_MAPPER.Notification,
            sk: lastEvaluatedKeySk,
          };
        }
      }
    }

    /* ============================================================
       CASE 1: STATE = ALL (Main Table Query)
       ============================================================ */
    if (normalizedState === "all") {
      do {
        const result = await fetchDynamoDBWithLimit<INotification>(
          ALL_TABLE_NAMES.Notification,
          limit,
          exclusiveStartKey,
          [
            NOTIFICATION.sk,
            NOTIFICATION.title,
            NOTIFICATION.created_at,
            NOTIFICATION.state,
            NOTIFICATION.type,
            NOTIFICATION.last_date_to_apply,
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
          last_date_to_apply: item.last_date_to_apply,
        })),
        lastEvaluatedKey: nextKey
          ? Buffer.from(JSON.stringify(nextKey)).toString("base64")
          : undefined,
      };
    }

    /* ============================================================
       CASE 2: STATE SPECIFIC (GSI)
       ============================================================ */

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
          NOTIFICATION.last_date_to_apply,
        ],
        limit,
        exclusiveStartKey,
        sortAscending: false,
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
        last_date_to_apply: item.last_date_to_apply,
      })),
      lastEvaluatedKey: nextKey
        ? Buffer.from(JSON.stringify(nextKey)).toString("base64")
        : undefined,
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

/**
 * Fetches ALL active notifications (approved, not archived, deadline not
 * passed) for a given category or state — no pagination, since this powers
 * the "Eligible Notifications" filter which needs the full active set to
 * compute eligibility against. Returns full notification objects (including
 * the eligibility sub-object) since that's not available from the
 * lightweight category/state GSI projection used elsewhere on this page.
 */
export async function getActiveNotificationsForFilter(
  filterType: "category" | "state",
  value: string,
): Promise<INotification[]> {
  try {
    const normalizedValue = value?.toLowerCase();
    if (!normalizedValue) return [];

    const indexName = filterType === "category" ? "categoryGsi" : "stateGsi";
    const keyConditionExpression =
      filterType === "category" ? "categoryPk = :value" : "statePk = :value";

    let accumulated: INotification[] = [];
    let exclusiveStartKey: Record<string, any> | undefined;

    do {
      const result = await fetchByIndexDynamoDB<INotification>({
        indexName,
        keyConditionExpression,
        expressionAttributeValues: {
          ":value": `${normalizedValue}${NOTIFICATION_TYPE_MAPPER.META}`,
        },
        attributesToGet: [
          NOTIFICATION.sk,
          NOTIFICATION.approved_at,
          NOTIFICATION.is_archived,
          NOTIFICATION.last_date_to_apply,
        ],
        limit: 1000,
        exclusiveStartKey,
        sortAscending: false,
      });

      accumulated = accumulated.concat(result.results);
      exclusiveStartKey = result.lastEvaluatedKey;
    } while (exclusiveStartKey);

    const now = Date.now();
    const activeSks = accumulated
      .filter(
        (item) =>
          !!item.approved_at &&
          !item.is_archived &&
          typeof item.last_date_to_apply === "number" &&
          item.last_date_to_apply >= now,
      )
      .map((item) => item.sk!);

    const fullNotifications = await Promise.all(
      activeSks.map((sk) => {
        const id = sk
          .replace(TABLE_PK_MAPPER.Notification, "")
          .replace(NOTIFICATION_TYPE_MAPPER.META, "");
        return getNotificationById(id);
      }),
    );

    return fullNotifications.filter((n): n is INotification => !!n);
  } catch (error) {
    logErrorLocation(
      "homeService.ts",
      "getActiveNotificationsForFilter",
      error,
      "DB error while fetching active notifications for eligibility filter",
      "",
      { filterType, value },
    );
    throw error;
  }
}

// Fetch the 10 latest notifications across all categories
export async function getLatestNotifications(): Promise<
  Array<{ title: string; sk: string; state?: string; last_date_to_apply?: string }>
> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAMES.Notification,
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
    // and exclude ones whose last date to apply has already passed.
    const now = Date.now();
    const approved = items.filter(
      (n) =>
        typeof n.approved_at === "number" &&
        (typeof n.last_date_to_apply !== "number" || n.last_date_to_apply >= now)
    );

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

// Fetch available states/categories/departments that have at least one approved notification
export async function getAvailableFilters(): Promise<{ states: string[]; categories: string[]; departments: string[] }> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAMES.Notification,
      undefined,
      [NOTIFICATION.state, NOTIFICATION.category, NOTIFICATION.department, NOTIFICATION.approved_at, NOTIFICATION.type],
      {
        [NOTIFICATION.type]: NOTIFICATION_TYPE.META,
      },
      "#type = :type",
      undefined,
      false // exclude archived
    );

    // Keep only approved ones
    const approved = items.filter((n) => typeof n.approved_at === "number");

    // Extract unique states/categories/departments
    const statesSet = new Set<string>();
    const categoriesSet = new Set<string>();
    const departmentsSet = new Set<string>();
    for (const item of approved) {
      if (item.state) {
        statesSet.add(item.state.toLowerCase());
      }
      if (item.category) {
        categoriesSet.add(item.category.toLowerCase());
      }
      if (item.department && item.department.toUpperCase() !== "UNKNOWN") {
        departmentsSet.add(item.department);
      }
    }

    return {
      states: Array.from(statesSet),
      categories: Array.from(categoriesSet),
      departments: Array.from(departmentsSet).sort((a, b) => a.localeCompare(b)),
    };
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

export interface IOpenNotificationFilters {
  category?: string;
  state?: string;
  department?: string;
  minVacancies?: number;
  search?: string;
  closingSoon?: boolean;
  sortBy?: "last_date_to_apply" | "created_at";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface IOpenNotificationItem {
  sk: string;
  title: string;
  category: string;
  state: string;
  department: string;
  total_vacancies?: number;
  last_date_to_apply?: number;
  created_at?: number;
  general_fee?: number;
}

/**
 * Fetches currently-open notifications (approved, not archived, deadline not
 * passed) across every category/state, with ad-hoc filtering + sorting +
 * offset pagination applied in memory — same full-scan-then-filter approach
 * already used by getHomePageNotifications/getLatestNotifications/
 * getAvailableFilters above, since these filters don't map onto a single GSI.
 * Fee/qualification aren't filterable here: those live on separate FEE/
 * ELIGIBILITY items in the single-table design, and joining them for every
 * notification just to filter would mean fetching far more than this scan.
 */
export async function getOpenNotifications(
  filters: IOpenNotificationFilters,
): Promise<{ data: IOpenNotificationItem[]; total: number; hasMore: boolean }> {
  try {
    const items = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAMES.Notification,
      undefined,
      [
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.category,
        NOTIFICATION.state,
        NOTIFICATION.department,
        NOTIFICATION.total_vacancies,
        NOTIFICATION.last_date_to_apply,
        NOTIFICATION.created_at,
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

    const now = Date.now();
    let filtered = items.filter(
      (n) =>
        typeof n.approved_at === "number" &&
        typeof n.last_date_to_apply === "number" &&
        n.last_date_to_apply >= now,
    );

    if (filters.category && filters.category !== "all") {
      const category = filters.category.toLowerCase();
      filtered = filtered.filter((n) => n.category?.toLowerCase() === category);
    }
    if (filters.state && filters.state !== "all") {
      const state = filters.state.toLowerCase();
      filtered = filtered.filter((n) => n.state?.toLowerCase() === state);
    }
    if (filters.department && filters.department.trim()) {
      const department = filters.department.trim().toLowerCase();
      filtered = filtered.filter((n) => n.department?.toLowerCase().includes(department));
    }
    if (typeof filters.minVacancies === "number" && filters.minVacancies > 0) {
      filtered = filtered.filter((n) => (n.total_vacancies ?? 0) >= filters.minVacancies!);
    }
    if (filters.search && filters.search.trim()) {
      const search = filters.search.trim().toLowerCase();
      filtered = filtered.filter((n) => n.title?.toLowerCase().includes(search));
    }
    // "Closing soon" = last date to apply falls within the next 2 days —
    // same threshold as the admin dashboard's closingSoon filter.
    if (filters.closingSoon) {
      const closingSoonUntil = now + 2 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(
        (n) => (n.last_date_to_apply as unknown as number) <= closingSoonUntil,
      );
    }

    const sortBy = filters.sortBy === "created_at" ? "created_at" : "last_date_to_apply";
    const sortOrder = filters.sortOrder === "desc" ? "desc" : "asc";
    filtered.sort((a, b) => {
      // last_date_to_apply/created_at are typed as string on INotification for
      // historical reasons, but are always stored as epoch numbers (see toEpoch
      // in addCompleteNotification) — same assumption getLatestNotifications
      // above already relies on.
      const av = Number(a[sortBy] ?? 0);
      const bv = Number(b[sortBy] ?? 0);
      return sortOrder === "asc" ? av - bv : bv - av;
    });

    const total = filtered.length;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
    const offset = filters.offset && filters.offset > 0 ? filters.offset : 0;
    const page = filtered.slice(offset, offset + limit);

    // Fee lives on a separate FEE item per notification — only worth joining
    // for the small page actually being returned, not the whole filtered set.
    const pageIds = page.map(
      (n) =>
        n.sk
          ?.replace(`${TABLE_PK_MAPPER.Notification}`, "")
          ?.replace(`${NOTIFICATION_TYPE_MAPPER.META}`, "") ?? "",
    );
    const generalFees = await Promise.all(
      pageIds.map(async (id) => {
        if (!id) return undefined;
        const feeSk = `${TABLE_PK_MAPPER.Notification}${id}${NOTIFICATION_TYPE_MAPPER.FEE}`;
        const feeItems = await fetchDynamoDB<any>(ALL_TABLE_NAMES.Notification, feeSk, [
          NOTIFICATION.fee.general_fee,
        ]);
        return feeItems?.[0]?.general_fee as number | undefined;
      }),
    );

    const data: IOpenNotificationItem[] = page.map((n, idx) => ({
      sk: pageIds[idx],
      title: n.title ?? "",
      category: n.category ?? "",
      state: n.state ?? "",
      department: n.department ?? "",
      total_vacancies: n.total_vacancies,
      last_date_to_apply: n.last_date_to_apply as unknown as number | undefined,
      created_at: n.created_at,
      general_fee: generalFees[idx],
    }));

    return { data, total, hasMore: offset + limit < total };
  } catch (error) {
    logErrorLocation(
      "homeService.ts",
      "getOpenNotifications",
      error,
      "DB error while fetching open notifications",
      "",
      { filters },
    );
    throw error;
  }
}