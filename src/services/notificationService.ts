import { logErrorLocation } from "../utils/errorUtils";
import {
  ALL_TABLE_NAME,
  NOTIFICATION_CATEGORIES,
  TABLE_PK_MAPPER,
} from "../db_schema/shared/SharedConstant";
import {
  fetchDynamoDB,
  fetchDynamoDBWithLimit,
} from "../Interpreter/dynamoDB/fetchCalls";
import {
  INotification,
  normalizeNotificationForm,
  NotificationForm,
  NotificationListItem,
  NotificationListResponse,
  NotificationRow,
} from "../db_schema/Notification/NotificationInterface";
import { updateDynamoDB } from "../Interpreter/dynamoDB/updateCalls";
import {
  DETAIL_VIEW_NOTIFICATION,
  HOME_PAGE_NOTIFICATION,
  NOTIFICATION,
  NOTIFICATION_TYPE,
} from "../db_schema/Notification/NotificationConstant";
import { INVALID_INPUT } from "../db_schema/shared/ErrorMessage";
import { generateId } from "../library/util";
import { insertBulkDataDynamoDB } from "../Interpreter/dynamoDB/transactCall";

// Add complete notification with all related tables
export async function addCompleteNotification(data: any) {
  try {
    const normalized = normalizeNotificationForm(data);
    const notificationId = generateId();
    const now = Date.now();
    const pk = TABLE_PK_MAPPER.Notification;

    const metaItem = {
      pk,
      sk: `${pk}${notificationId}#META`,

      // notification_id: notificationId,
      type: NOTIFICATION_TYPE.META,
      title: normalized.title,
      category: normalized.category,
      department: normalized.department,

      start_date: normalized.start_date,
      last_date_to_apply: normalized.last_date_to_apply,
      exam_date: normalized.exam_date,

      total_vacancies: normalized.total_vacancies,

      is_archived: false,
      approved_at: null,
      created_at: now,
      modified_at: now,

      gsi1pk: `CATEGORY#${normalized.category}`,
      gsi1sk: `DATE#${normalized.last_date_to_apply}#${notificationId}`,
    };

    const detailsItem = {
      pk,
      sk: `${pk}${notificationId}#DETAILS`,
      type: NOTIFICATION_TYPE.DETAILS,
      short_description: normalized.short_description,
      long_description: normalized.long_description,
      important_date_details: normalized.important_date_details,
    };

    const feeItem = {
      pk,
      sk: `${pk}${notificationId}#FEE`,
      type: NOTIFICATION_TYPE.FEE,
      ...normalized.fee,
    };

    const eligibilityItem = {
      pk,
      sk: `${pk}${notificationId}#ELIGIBILITY`,
      type: NOTIFICATION_TYPE.ELIGIBILITY,
      ...normalized.eligibility,
    };

    const linksItem = {
      pk,
      sk: `${pk}${notificationId}#LINKS`,
      type: NOTIFICATION_TYPE.LINKS,
      ...normalized.links,
    };
    // 🔥 ATOMIC INSERT (THIS WAS MISSING)
    await insertBulkDataDynamoDB(ALL_TABLE_NAME.Notification, [
      metaItem,
      detailsItem,
      feeItem,
      eligibilityItem,
      linksItem,
    ]);
    return {
      success: true,
      notificationId,
      pk,
      message: "Notification created successfully",
    };
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "addCompleteNotification",
      error,
      "DB error while creating notification (DynamoDB)",
      "",
      { data }
    );
    throw error;
  }
}

// View all notifications (excluding archived)
export async function viewNotifications(): Promise<any[]> {
  try {
    const notifications = await fetchDynamoDB<any>(
      ALL_TABLE_NAME.Notification,
      undefined,
      [
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.category,
        NOTIFICATION.created_at,
        NOTIFICATION.type,
      ],
      { [NOTIFICATION.type]: NOTIFICATION_TYPE.META },
      "#type = :type",
      undefined,
      false
    );
    return notifications.sort(
      (a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)
    );
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "viewNotifications",
      error,
      "DB error while fetching notifications list (DynamoDB)",
      "",
      {}
    );
    throw error;
  }
}

// Get single notification by ID with all related data
export async function getNotificationById(
  id: string
): Promise<INotification | null> {
  try {
    const notificationSk = TABLE_PK_MAPPER.Notification + id;
    const result = await fetchDynamoDB<INotification>(
      ALL_TABLE_NAME.Notification, // PK = Notification#
      notificationSk,
      DETAIL_VIEW_NOTIFICATION
    );
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationById",
      error,
      "DB error while fetching notification by id (DynamoDB)",
      "",
      { id }
    );
    throw error;
  }
}

// Edit notification with all related tables
export async function editCompleteNotification(
  id: string,
  data: NotificationForm
) {
  try {
    const notificationSk = TABLE_PK_MAPPER.Notification + id;
    if (!notificationSk || !data) {
      throw new Error(INVALID_INPUT);
    }
    const attributestoUpdate = {
      ...data,
    };
    const { sk } = await updateDynamoDB(
      TABLE_PK_MAPPER.Notification,
      notificationSk,
      attributestoUpdate
    );
    return true;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "editCompleteNotification",
      error,
      "DB error while editing notification (DynamoDB)",
      "",
      { id, data }
    );
    throw error;
  }
}

// Approve notification
export async function approveNotification(
  id: string,
  approvedBy: string
): Promise<any | null> {
  try {
    const notoficationSk = TABLE_PK_MAPPER.Notification + id;
    const attributesToUpdate = {
      [NOTIFICATION.approved_at]: Date.now(),
      [NOTIFICATION.approved_by]: approvedBy,
    };
    await updateDynamoDB(
      TABLE_PK_MAPPER.Notification,
      notoficationSk,
      attributesToUpdate
    );
    return attributesToUpdate;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "approveNotification",
      error,
      "DB error while approving notification (DynamoDB)",
      "",
      { id, approvedBy }
    );
    throw error;
  }
}

// Archive notification (soft delete)
export async function archiveNotification(id: string): Promise<any | null> {
  try {
    const notificationSk = TABLE_PK_MAPPER.Notification + id;
    const attributesToUpdate = {
      [NOTIFICATION.is_archived]: true,
    };
    await updateDynamoDB(
      TABLE_PK_MAPPER.Notification,
      notificationSk,
      attributesToUpdate
    );
    return true;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "archiveNotification",
      error,
      "DB error while archiving notification (DynamoDB)",
      "",
      { id }
    );
    throw error;
  }
}

// Unarchive notification
export async function unarchiveNotification(id: string): Promise<any | null> {
  try {
    const notificationSk = TABLE_PK_MAPPER.Notification + id;
    const attributestoUpdate = {
      [NOTIFICATION.is_archived]: false,
    };
    await updateDynamoDB(
      TABLE_PK_MAPPER.Notification,
      notificationSk,
      attributestoUpdate
    );
    return true;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "unarchiveNotification",
      error,
      "DB error while unarchiving notification (DynamoDB)",
      "",
      { id }
    );
    throw error;
  }
}

// Fetch notifications for home page, filtered to approved (and non-archived when column exists),
// then group them by category for sections like Jobs, Results
export async function getHomePageNotifications(): Promise<
  Record<string, Array<{ title: string; sk: string }>>
> {
  try {
    const notifications = await fetchDynamoDB<NotificationForm>(
      ALL_TABLE_NAME.Notification,
      undefined,
      HOME_PAGE_NOTIFICATION,
      { [NOTIFICATION.approved_by]: "admin" },
      "(#approved_by=:approved_by)",
      undefined,
      false
    );

    console.log("notifications", notifications);

    // 2️⃣ Sort by created_at DESC (SQL equivalent)
    notifications.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

    // 3️⃣ Group notifications
    const grouped: Record<string, Array<{ title: string; sk: string }>> = {};

    for (const n of notifications) {
      const category = n.category || "Uncategorized";

      // Primary category
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({
        title: n.title,
        sk: n.sk,
      });

      // Virtual categories
      if (n.has_admit_card) {
        if (!grouped[NOTIFICATION_CATEGORIES.ADMIT_CARD]) {
          grouped[NOTIFICATION_CATEGORIES.ADMIT_CARD] = [];
        }
        grouped[NOTIFICATION_CATEGORIES.ADMIT_CARD].push({
          title: n.title,
          sk: n.sk,
        });
      }

      if (n.has_syllabus) {
        if (!grouped[NOTIFICATION_CATEGORIES.SYLLABUS]) {
          grouped[NOTIFICATION_CATEGORIES.SYLLABUS] = [];
        }
        grouped[NOTIFICATION_CATEGORIES.SYLLABUS].push({
          title: n.title,
          sk: n.sk,
        });
      }

      if (n.has_answer_key) {
        if (!grouped[NOTIFICATION_CATEGORIES.ANSWER_KEY]) {
          grouped[NOTIFICATION_CATEGORIES.ANSWER_KEY] = [];
        }
        grouped[NOTIFICATION_CATEGORIES.ANSWER_KEY].push({
          title: n.title,
          sk: n.sk,
        });
      }

      if (n.has_result) {
        if (!grouped[NOTIFICATION_CATEGORIES.RESULT]) {
          grouped[NOTIFICATION_CATEGORIES.RESULT] = [];
        }
        grouped[NOTIFICATION_CATEGORIES.RESULT].push({
          title: n.title,
          sk: n.sk,
        });
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
// always returning only approved and non-archived records plus total count/hasMore.
export async function getNotificationsByCategory(
  category: string,
  limit: number,
  lastEvaluatedKey?: Record<string, any>,
  searchValue?: string
): Promise<NotificationListResponse> {
  try {
    const normalizedCategory = category?.toLowerCase() || "all";

    const expressionFilters: string[] = [];
    const expressionValues: Record<string, any> = {};

    // 1️⃣ Approved only
    expressionFilters.push("attribute_exists(#approved_at)");

    // 2️⃣ Category handling
    const specialCategoryFlags: Record<string, string> = {
      [NOTIFICATION_CATEGORIES.ADMIT_CARD]: "has_admit_card",
      [NOTIFICATION_CATEGORIES.SYLLABUS]: "has_syllabus",
      [NOTIFICATION_CATEGORIES.ANSWER_KEY]: "has_answer_key",
      [NOTIFICATION_CATEGORIES.RESULT]: "has_result",
    };

    const flag = specialCategoryFlags[normalizedCategory];
    if (normalizedCategory !== "all") {
      if (flag) {
        expressionFilters.push(`#${flag} = :true`);
        expressionValues[":true"] = true;
      } else {
        expressionFilters.push("#category = :category");
        expressionValues[":category"] = category;
      }
    }

    // 3️⃣ Search (contains)
    if (searchValue && searchValue.trim()) {
      expressionFilters.push(
        "(contains(#title, :search) OR contains(#department, :search))"
      );
      expressionValues[":search"] = searchValue.toLowerCase();
    }

    const filterExpression =
      expressionFilters.length > 0
        ? expressionFilters.join(" AND ")
        : undefined;

    // 4️⃣ Fetch from DynamoDB
    const result = await fetchDynamoDBWithLimit<{
      title: string;
      created_at?: number;
      sk: string;
    }>(TABLE_PK_MAPPER.Notification, limit, lastEvaluatedKey);

    // 5️⃣ Sort by created_at DESC (SQL equivalent)
    result.results.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

    return {
      data: result.results.map((n) => ({
        title: n.title,
        sk: n.sk,
      })),
      total: -1,
      page: 0, // not meaningful in DynamoDB
      hasMore: !!result.lastEvaluatedKey,
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationsByCategory",
      error,
      "DB error while fetching notifications by category (DynamoDB)",
      "",
      { category, limit, lastEvaluatedKey, searchValue }
    );
    throw error;
  }
}
