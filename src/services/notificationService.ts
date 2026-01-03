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
import { updateDynamoDB } from "../Interpreter/dynamoDB/updateCalls";
import {
  DETAIL_VIEW_NOTIFICATION,
  NOTIFICATION,
  NOTIFICATION_TYPE,
} from "../db_schema/Notification/NotificationConstant";
import { INVALID_INPUT } from "../db_schema/shared/ErrorMessage";
import { buildNotificationDetail, generateId, toEpoch } from "../library/util";
import { insertBulkDataDynamoDB } from "../Interpreter/dynamoDB/transactCall";
import {
  INotification,
  INotificationListItem,
} from "../db_schema/Notification/NotificationInterface";
import { IKeyValues } from "../db_schema/shared/SharedInterface";

// Add complete notification with all related tables
export async function addCompleteNotification(data: INotification) {
  try {
    if (!data.title || !data.category || !data.start_date) {
      throw new Error("Missing required notification fields");
    }

    const notificationId = generateId();
    const now = Date.now();
    const pk = TABLE_PK_MAPPER.Notification;

    const base = {
      pk,
      notification_id: notificationId,
      created_at: now,
      modified_at: now,
    };

    // ✅ Normalize dates
    const startDate = toEpoch(data.start_date);
    const lastDateToApply = toEpoch(data.last_date_to_apply);
    const examDate = toEpoch(data.exam_date);

    const metaItem = {
      ...base,
      sk: `${pk}${notificationId}#META`,
      type: NOTIFICATION_TYPE.META,

      title: data.title,
      category: data.category || "UNKNOWN",
      department: data.department || "UNKNOWN",

      start_date: startDate,
      last_date_to_apply: lastDateToApply,
      exam_date: examDate,

      total_vacancies: data.total_vacancies,

      is_archived: false,
      approved_at: null,

      // ✅ GSI must also use NUMBER
      gsi1pk: `CATEGORY#${data.category || "UNKNOWN"}`,
      gsi1sk: `DATE#${lastDateToApply ?? 0}#${notificationId}`,
    };

    const detailsItem = {
      ...base,
      sk: `${pk}${notificationId}#DETAILS`,
      type: NOTIFICATION_TYPE.DETAILS,
      short_description: data.details?.short_description || "",
      long_description: data.details?.long_description || "",
      important_date_details: data.details?.important_date_details || "",
    };

    const feeItem = {
      ...base,
      sk: `${pk}${notificationId}#FEE`,
      type: NOTIFICATION_TYPE.FEE,
      ...(data.fee || {}),
    };

    const eligibilityItem = {
      ...base,
      sk: `${pk}${notificationId}#ELIGIBILITY`,
      type: NOTIFICATION_TYPE.ELIGIBILITY,
      ...(data.eligibility || {}),
    };

    const linksItem = {
      ...base,
      sk: `${pk}${notificationId}#LINKS`,
      type: NOTIFICATION_TYPE.LINKS,
      ...Object.fromEntries(
        Object.entries(data.links || {}).filter(([_, v]) => !!v)
      ),
    };

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
export async function viewNotifications(): Promise<INotificationListItem[]> {
  try {
    const notifications = await fetchDynamoDB<INotificationListItem>(
      ALL_TABLE_NAME.Notification,
      undefined,
      [
        NOTIFICATION.pk,
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.category,
        NOTIFICATION.created_at,
        NOTIFICATION.approved_at,
        NOTIFICATION.approved_by,
        NOTIFICATION.type,
        NOTIFICATION.is_archived,
      ],
      { [NOTIFICATION.type]: NOTIFICATION_TYPE.META },
      "#type = :type",
    );

    return notifications.sort((a, b) => b.created_at - a.created_at);
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
    if (!id) {
      throw new Error("Invalid notification id");
    }
    const skPrefix = `${TABLE_PK_MAPPER.Notification}${id}`;
    const items = await fetchDynamoDB<any>(
      ALL_TABLE_NAME.Notification,
      undefined,
      DETAIL_VIEW_NOTIFICATION,
      undefined,
      undefined,
      undefined,
      undefined,
      skPrefix
    );
    if (!items || items.length === 0) {
      return null;
    }
    // Ensure META exists
    const meta = items.find((i) => i.type === NOTIFICATION_TYPE.META);
    if (!meta) {
      return null;
    }
    return buildNotificationDetail(items);
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
  data: Partial<INotification>
) {
  try {
    console.log("data", data);
    if (!id || !data) {
      throw new Error(INVALID_INPUT);
    }

    const pk = TABLE_PK_MAPPER.Notification;
    const now = Date.now();

    const updates: Promise<any>[] = [];

    /* ================= META ================= */
    if (
      data.title ||
      data.category ||
      data.department ||
      data.start_date ||
      data.last_date_to_apply ||
      data.exam_date ||
      data.total_vacancies !== undefined
    ) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}#META`, {
          ...(data.title && { title: data.title }),
          ...(data.category && { category: data.category }),
          ...(data.department && { department: data.department }),
          ...(data.start_date && { start_date: data.start_date }),
          ...(data.last_date_to_apply && {
            last_date_to_apply: data.last_date_to_apply,
          }),
          ...(data.exam_date && { exam_date: data.exam_date }),
          ...(data.total_vacancies !== undefined && {
            total_vacancies: data.total_vacancies,
          }),
        })
      );
    }

    /* ================= DETAILS ================= */
    if (data.details) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}#DETAILS`, {
          ...data.details,
        })
      );
    }

    /* ================= FEE ================= */
    if (data.fee) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}#FEE`, {
          ...data.fee,
        })
      );
    }

    /* ================= ELIGIBILITY ================= */
    if (data.eligibility) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}#ELIGIBILITY`, {
          ...data.eligibility,
        })
      );
    }

    /* ================= LINKS ================= */
    if (data.links) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}#LINKS`, {
          ...Object.fromEntries(
            Object.entries(data.links).filter(([_, v]) => !!v)
          ),
        })
      );
    }

    await Promise.all(updates);
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
): Promise<{
  approved_at: number;
  approved_by: string;
}> {
  try {
    if (!id || !approvedBy) {
      throw new Error("Invalid approve notification input");
    }

    const pk = TABLE_PK_MAPPER.Notification;
    const sk = `${pk}${id}#META`;
    const now = Date.now();

    const attributesToUpdate = {
      approved_at: now,
      approved_by: approvedBy,
    };

    await updateDynamoDB(pk, sk, attributesToUpdate);

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
// Archive notification (soft delete)
export async function archiveNotification(id: string): Promise<boolean> {
  try {
    if (!id) {
      throw new Error("Invalid notification id");
    }

    const pk = TABLE_PK_MAPPER.Notification;
    const sk = `${pk}${id}#META`;
    const now = Date.now();

    const attributesToUpdate = {
      is_archived: true,
    };

    await updateDynamoDB(pk, sk, attributesToUpdate);

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
// Unarchive notification (restore)
export async function unarchiveNotification(id: string): Promise<boolean> {
  try {
    if (!id) {
      throw new Error("Invalid notification id");
    }

    const pk = TABLE_PK_MAPPER.Notification;
    const sk = `${pk}${id}#META`;

    const attributesToUpdate = {
      is_archived: false,
    };

    await updateDynamoDB(pk, sk, attributesToUpdate);

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
  data: Array<{ title: string; id: string }>;
  lastEvaluatedKey?: string; // ONLY sk returned
}> {
  try {
    /* ================= PAGINATION ================= */
    let lastEvaluatedKey:
      | { pk: string; sk: string }
      | undefined;
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
    result.results.sort(
      (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)
    );
    /* ================= RESPONSE ================= */
    return {
      data: result.results.map((n) => ({
        title: n.title,
        id: n.sk!
          .replace(`${TABLE_PK_MAPPER.Notification}`, "")
          .replace("#META", ""),
      })),
      lastEvaluatedKey: result.lastEvaluatedKey?.sk, // ✅ ONLY sk
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

