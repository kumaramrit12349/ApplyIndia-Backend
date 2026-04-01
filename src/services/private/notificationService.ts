import {
  DETAIL_VIEW_NOTIFICATION,
  NOTIFICATION,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_MAPPER,
} from "../../db_schema/Notification/NotificationConstant";
import {
  INotification,
  INotificationListItem,
  IReviewComment,
} from "../../db_schema/Notification/NotificationInterface";
import { INVALID_INPUT } from "../../db_schema/shared/ErrorMessage";
import {
  ALL_TABLE_NAMES,
  TABLE_PK_MAPPER,
} from "../../db_schema/shared/SharedConstant";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertBulkDataDynamoDB } from "../../Interpreter/dynamoDB/transactCall";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import {
  buildNotificationDetail,
  generateId,
  toEpoch,
} from "../../library/util";
import { logErrorLocation } from "../../utils/errorUtils";
import { getUserProfile, getCognitoUserEmail } from "../authService";

// Add complete notification with all related tables
export async function addCompleteNotification(data: INotification) {
  try {
    if (!data.title || !data.category || !data.state || !data.start_date) {
      throw new Error("Missing required notification fields");
    }
    const notificationId = generateId();
    const now = Date.now();
    const pk = TABLE_PK_MAPPER.Notification;
    const base = {
      pk,
      notification_id: notificationId,
      created_by: data.created_by || "System",
      created_at: now,
      modified_at: now,
    };
    // Normalize dates
    const startDate = toEpoch(data.start_date);
    const lastDateToApply = toEpoch(data.last_date_to_apply);
    const examDate = toEpoch(data.exam_date);
    // IMPORTANT: pad for proper string sorting
    const paddedLastDate = String(lastDateToApply ?? 0).padStart(15, "0");
    const normalizedCategory = (data.category || "UNKNOWN").toLowerCase();
    const normalizedState = (data.state || "UNKNOWN").toLowerCase();
    const metaItem = {
      ...base,
      sk: `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.META}`,
      type: NOTIFICATION_TYPE.META,
      title: data.title,
      category: data.category || "UNKNOWN",
      state: data.state || "UNKNOWN",
      department: data.department || "UNKNOWN",
      start_date: startDate,
      last_date_to_apply: lastDateToApply,
      exam_date: examDate,
      total_vacancies: data.total_vacancies,
      has_syllabus: data?.has_syllabus ?? false,
      has_admit_card: data?.has_admit_card ?? false,
      has_result: data?.has_result ?? false,
      has_answer_key: data?.has_answer_key ?? false,
      is_archived: false,
      approved_at: null,
      review_status: "pending",
      /**
       * ========================= GSI1 DESIGN =========================
       *
       * WHY this GSI exists:
       * DynamoDB does NOT optimize FilterExpression.
       * It only optimizes:
       *   - Partition Key equality
       *   - Sort Key range conditions
       *
       * Our main query pattern:
       *   1. Fetch notifications by category
       *   2. Only type = META
       *   3. Only approved_by = ADMIN
       *   4. Only where last_date_to_apply >= today
       *   5. Sorted by last_date_to_apply
       *   6. Paginated
       *
       * To avoid slow filtering & multiple DB round-trips,
       * we encode all fixed filters inside the GSI partition key.
       *
       * ---------------------------------------------------------------
       * categoryPk:
       *   {category}#META
       *
       *   → This removes the need for FilterExpression on:
       *       - category
       *       - type
       *       - approval status
       *
       * ---------------------------------------------------------------
       * categorySk:
       *   {padded_last_date_to_apply}#{created_at}
       *
       *   → Allows efficient range query:
       *       categorySk >= today
       *
       *   → Automatically sorts by last_date_to_apply
       *
       *   → created_at ensures:
       *       - uniqueness
       *       - stable pagination
       *
       * ---------------------------------------------------------------
       * IMPORTANT:
       * We pad last_date_to_apply to 15 digits because
       * DynamoDB sort key is string-based and sorting is lexicographical.
       * Padding ensures correct numeric ordering.
       *
       * RESULT:
       *   - No FilterExpression
       *   - No JS sorting
       *   - No loop fetching
       *   - Single fast indexed query (~50-120ms)
       *
       * DynamoDB rule:
       *   Design indexes based on ACCESS PATTERNS, not storage.
       * ================================================================
       */
      categoryPk: `${normalizedCategory}${NOTIFICATION_TYPE_MAPPER.META}`,
      categorySk: `${paddedLastDate}#${now}`,
      statePk: `${normalizedState}${NOTIFICATION_TYPE_MAPPER.META}`,
      stateSk: `${paddedLastDate}#${now}`,
      // Scraper provenance (undefined for manual entries)
      ...(data.source_url && { source_url: data.source_url }),
      ...(data.scraped_from && { scraped_from: data.scraped_from }),
    };
    const detailsItem = {
      ...base,
      sk: `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.DETAILS}`,
      type: NOTIFICATION_TYPE.DETAILS,
      short_description: data.details?.short_description || "",
      long_description: data.details?.long_description || "",
      important_date_details: data.details?.important_date_details || "",
    };
    const feeItem = {
      ...base,
      sk: `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.FEE}`,
      type: NOTIFICATION_TYPE.FEE,
      ...(data.fee || {}),
    };
    const eligibilityItem = {
      ...base,
      sk: `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.ELIGIBILITY}`,
      type: NOTIFICATION_TYPE.ELIGIBILITY,
      ...(data.eligibility || {}),
    };
    const linksItem = {
      ...base,
      sk: `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.LINKS}`,
      type: NOTIFICATION_TYPE.LINKS,
      ...Object.fromEntries(
        Object.entries(data.links || {}).filter(([_, v]) => !!v),
      ),
    };
    await insertBulkDataDynamoDB(ALL_TABLE_NAMES.Notification, [
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
      { data },
    );
    throw error;
  }
}

// View all notifications (excluding archived) with optional search + time filtering
export async function viewNotifications(
  search?: string,
  timeRange?: string,
  category?: string,
  state?: string,
): Promise<INotificationListItem[]> {
  try {
    // Build filter expressions
    let filterString = "#type = :type";
    const queryFilter: Record<string, any> = {
      [NOTIFICATION.type]: NOTIFICATION_TYPE.META,
    };

    // Time-range filtering on created_at (same pattern as feedbackService)
    if (timeRange && timeRange !== "all") {
      const now = new Date();
      let startTimeMillis = 0;

      switch (timeRange) {
        case "today":
          now.setHours(0, 0, 0, 0);
          startTimeMillis = now.getTime();
          break;
        case "last_week":
          startTimeMillis = now.getTime() - 7 * 24 * 60 * 60 * 1000;
          break;
        case "last_month":
          now.setMonth(now.getMonth() - 1);
          startTimeMillis = now.getTime();
          break;
        case "last_3_months":
          now.setMonth(now.getMonth() - 3);
          startTimeMillis = now.getTime();
          break;
        case "last_6_months":
          now.setMonth(now.getMonth() - 6);
          startTimeMillis = now.getTime();
          break;
      }

      if (startTimeMillis > 0) {
        filterString += " AND #created_at >= :startTime";
        queryFilter["created_at"] = "created_at";
        queryFilter["startTime"] = startTimeMillis;
      }
    }

    if (category && category !== "all") {
      filterString += " AND #category = :category";
      queryFilter["category"] = category;
    }
 
    if (state && state !== "all") {
      filterString += " AND #state = :state";
      queryFilter["state"] = state;
    }

    let notifications = await fetchDynamoDB<INotificationListItem>(
      ALL_TABLE_NAMES.Notification,
      undefined,
      [
        NOTIFICATION.pk,
        NOTIFICATION.sk,
        NOTIFICATION.title,
        NOTIFICATION.state,
        NOTIFICATION.category,
        NOTIFICATION.created_at,
        NOTIFICATION.approved_at,
        NOTIFICATION.approved_by,
        NOTIFICATION.type,
        NOTIFICATION.is_archived,
        NOTIFICATION.review_status,
      ],
      queryFilter,
      filterString,
    );

    // Post-fetch search filtering (case-insensitive title or SK substring match)
    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      notifications = notifications.filter((n) =>
        n.title?.toLowerCase().includes(searchLower) ||
        n.sk?.toLowerCase().includes(searchLower)
      );
    }

    return notifications.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "viewNotifications",
      error,
      "DB error while fetching notifications list (DynamoDB)",
      "",
      {},
    );
    throw error;
  }
}

// Get single notification by ID with all related data
export async function getNotificationById(
  id: string,
): Promise<INotification | null> {
  try {
    if (!id) {
      throw new Error("Invalid notification id");
    }
    const skPrefix = `${TABLE_PK_MAPPER.Notification}${id}`;
    const items = await fetchDynamoDB<any>(
      ALL_TABLE_NAMES.Notification,
      undefined,
      DETAIL_VIEW_NOTIFICATION,
      undefined,
      undefined,
      undefined,
      undefined,
      skPrefix,
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
      { id },
    );
    throw error;
  }
}

// Get review comments for a notification
export async function getReviewComments(
  notificationId: string,
): Promise<IReviewComment[]> {
  try {
    if (!notificationId) {
      throw new Error("Invalid notification id");
    }
    const pk = TABLE_PK_MAPPER.Notification;
    const skPrefix = `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.COMMENT}`;
    const items = await fetchDynamoDB<any>(
      ALL_TABLE_NAMES.Notification,
      undefined,
      undefined,
      { [NOTIFICATION.type]: NOTIFICATION_TYPE.COMMENT },
      "#type = :type",
      undefined,
      undefined,
      skPrefix,
    );
    let comments = (items || [])
      .map((item: any) => ({
        comment_id: item.comment_id,
        reviewer_sub: item.reviewer_sub,
        reviewer_name: item.reviewer_name,
        comment_text: item.comment_text,
        created_at: item.created_at,
      }))
      .sort((a: IReviewComment, b: IReviewComment) => b.created_at - a.created_at);

    // Enrich reviewer names for old comments where reviewer_name might be a UUID or missing
    comments = await Promise.all(
      comments.map(async (c: IReviewComment) => {
        if (!c.reviewer_name || c.reviewer_name === c.reviewer_sub || c.reviewer_name.length === 36) {
          try {
            const profile = await getUserProfile(c.reviewer_sub);
            if (profile) {
              const name = [profile.given_name, profile.family_name]
                .filter(Boolean)
                .join(" ");
              let email = profile.email;
              if (!email) {
                email = await getCognitoUserEmail(c.reviewer_sub) || "";
              }
              if (name) {
                c.reviewer_name = email ? `${name} (${email})` : name;
              } else if (email) {
                c.reviewer_name = email;
              }
            } else {
              const email = await getCognitoUserEmail(c.reviewer_sub);
              if (email) {
                c.reviewer_name = email;
              }
            }
          } catch (e) {
            // ignore fetch errors
          }
        }
        return c;
      })
    );

    return comments;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "getReviewComments",
      error,
      "DB error while fetching review comments (DynamoDB)",
      "",
      { notificationId },
    );
    throw error;
  }
}

// Add a review comment to a notification
export async function addReviewComment(
  notificationId: string,
  reviewerSub: string,
  reviewerName: string,
  commentText: string,
  requestChanges: boolean = false,
): Promise<IReviewComment> {
  try {
    if (!notificationId || !commentText) {
      throw new Error("Invalid comment input");
    }
    const pk = TABLE_PK_MAPPER.Notification;
    const now = Date.now();
    const commentId = generateId();
    const commentItem = {
      pk,
      sk: `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.COMMENT}#${commentId}`,
      type: NOTIFICATION_TYPE.COMMENT,
      notification_id: notificationId,
      comment_id: commentId,
      reviewer_sub: reviewerSub,
      reviewer_name: reviewerName,
      comment_text: commentText,
      created_at: now,
    };
    await insertBulkDataDynamoDB(ALL_TABLE_NAMES.Notification, [commentItem]);

    // If requesting changes, update review_status on the META item
    if (requestChanges) {
      const metaSk = `${pk}${notificationId}${NOTIFICATION_TYPE_MAPPER.META}`;
      await updateDynamoDB(pk, metaSk, { review_status: "changes_requested" });
    }

    return {
      comment_id: commentId,
      reviewer_sub: reviewerSub,
      reviewer_name: reviewerName,
      comment_text: commentText,
      created_at: now,
    };
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "addReviewComment",
      error,
      "DB error while adding review comment (DynamoDB)",
      "",
      { notificationId, commentText },
    );
    throw error;
  }
}

// Edit notification with all related tables
export async function editCompleteNotification(
  id: string,
  data: Partial<INotification>,
) {
  try {
    if (!id || !data) {
      throw new Error(INVALID_INPUT);
    }
    const pk = TABLE_PK_MAPPER.Notification;
    const notificationSk = `${pk}${id}${NOTIFICATION_TYPE_MAPPER.META}`;
    const updates: Promise<any>[] = [];

    /* ================= META ================= */
    if (
      data.title ||
      data.category ||
      data.state ||
      data.department ||
      data.start_date ||
      data.last_date_to_apply !== undefined ||
      data.exam_date ||
      data.total_vacancies !== undefined ||
      data.has_admit_card !== undefined ||
      data.has_answer_key !== undefined ||
      data.has_result !== undefined ||
      data.has_syllabus !== undefined
    ) {
      // We must fetch existing meta to construct GSI Sort Keys safely
      const existingMetaArr = await fetchDynamoDB<INotification>(
        ALL_TABLE_NAMES.Notification,
        notificationSk
      );
      const existingMeta = existingMetaArr[0];
      if (!existingMeta) throw new Error("Notification not found");

      const updatePayload: any = {
        ...(data.title && { title: data.title }),
        ...(data.department && { department: data.department }),
        ...(data.exam_date && { exam_date: toEpoch(data.exam_date) }),
        ...(data.start_date && { start_date: toEpoch(data.start_date) }),
        ...(data.total_vacancies !== undefined && {
          total_vacancies: data.total_vacancies,
        }),
        ...(data.has_admit_card !== undefined && { has_admit_card: data.has_admit_card }),
        ...(data.has_answer_key !== undefined && { has_answer_key: data.has_answer_key }),
        ...(data.has_result !== undefined && { has_result: data.has_result }),
        ...(data.has_syllabus !== undefined && { has_syllabus: data.has_syllabus }),
      };

      const finalCategory = data.category || existingMeta.category;
      const finalState = data.state || existingMeta.state || "UNKNOWN";

      const newEpochLastDate = data.last_date_to_apply !== undefined
        ? toEpoch(data.last_date_to_apply)
        : existingMeta.last_date_to_apply;

      const paddedLastDate = String(newEpochLastDate ?? 0).padStart(15, "0");
      const originalCreatedAt = existingMeta.created_at || Date.now();

      if (data.last_date_to_apply !== undefined) {
        updatePayload.last_date_to_apply = newEpochLastDate;
      }

      // Always overwrite these to heal old data missing statePk/Sk or categoryPk/Sk
      if (finalCategory) {
        updatePayload.category = finalCategory;
        updatePayload.categoryPk = `${finalCategory.toLowerCase()}${NOTIFICATION_TYPE_MAPPER.META}`;
        updatePayload.categorySk = `${paddedLastDate}#${originalCreatedAt}`;
      }

      if (finalState) {
        updatePayload.state = finalState;
        updatePayload.statePk = `${finalState.toLowerCase()}${NOTIFICATION_TYPE_MAPPER.META}`;
        updatePayload.stateSk = `${paddedLastDate}#${originalCreatedAt}`;
      }

      updates.push(updateDynamoDB(pk, notificationSk, updatePayload));
    }

    /* ================= DETAILS ================= */
    if (data.details && Object.keys(data.details).length > 0) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}${NOTIFICATION_TYPE_MAPPER.DETAILS}`, {
          ...data.details,
        }),
      );
    }
    /* ================= FEE ================= */
    if (data.fee && Object.keys(data.fee).length > 0) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}${NOTIFICATION_TYPE_MAPPER.FEE}`, {
          ...data.fee,
        }),
      );
    }
    /* ================= ELIGIBILITY ================= */
    if (data.eligibility && Object.keys(data.eligibility).length > 0) {
      updates.push(
        updateDynamoDB(pk, `${pk}${id}${NOTIFICATION_TYPE_MAPPER.ELIGIBILITY}`, {
          ...data.eligibility,
        }),
      );
    }
    /* ================= LINKS ================= */
    if (data.links && Object.keys(data.links).length > 0) {
      const validLinks = Object.fromEntries(
        Object.entries(data.links).filter(([_, v]) => !!v)
      );
      if (Object.keys(validLinks).length > 0) {
        updates.push(
          updateDynamoDB(pk, `${pk}${id}${NOTIFICATION_TYPE_MAPPER.LINKS}`, validLinks),
        );
      }
    }
    await Promise.all(updates);

    // If the notification had changes requested, reset to pending after edit
    const pk2 = TABLE_PK_MAPPER.Notification;
    const metaSk = `${pk2}${id}${NOTIFICATION_TYPE_MAPPER.META}`;
    const existingArr = await fetchDynamoDB<any>(
      ALL_TABLE_NAMES.Notification,
      metaSk
    );
    const existing = existingArr[0];
    if (existing?.review_status === "changes_requested") {
      await updateDynamoDB(pk2, metaSk, { review_status: "pending" });
    }

    return true;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "editCompleteNotification",
      error,
      "DB error while editing notification (DynamoDB)",
      "",
      { id, data },
    );
    throw error;
  }
}

// Approve notification
export async function approveNotification(
  id: string,
  approvedBy: string,
): Promise<{
  approved_at: number;
  approved_by: string;
}> {
  try {
    if (!id || !approvedBy) {
      throw new Error("Invalid approve notification input");
    }
    const pk = TABLE_PK_MAPPER.Notification;
    const sk = `${pk}${id}${NOTIFICATION_TYPE_MAPPER.META}`;
    const now = Date.now();
    const attributesToUpdate = {
      approved_at: now,
      approved_by: approvedBy,
      review_status: "approved",
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
      { id, approvedBy },
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
    const sk = `${pk}${id}${NOTIFICATION_TYPE_MAPPER.META}`;
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
      { id },
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
    const sk = `${pk}${id}${NOTIFICATION_TYPE_MAPPER.META}`;
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
      { id },
    );
    throw error;
  }
}
// Permanent delete (hard delete) of all related entries
export async function permanentDeleteNotification(id: string): Promise<boolean> {
  try {
    if (!id) {
      throw new Error("Invalid notification id");
    }
    const pk = TABLE_PK_MAPPER.Notification;
    const skPrefix = `${pk}${id}`;

    // 1. Fetch ALL records starting with Notification{id}
    // This includes META, DETAILS, FEE, ELIGIBILITY, LINKS, and all COMMENTS
    const items = await fetchDynamoDB<any>(
      ALL_TABLE_NAMES.Notification,
      undefined,
      [NOTIFICATION.pk, NOTIFICATION.sk],
      undefined,
      undefined,
      undefined,
      undefined,
      skPrefix,
    );

    if (!items || items.length === 0) {
      console.warn(`[PermanentDelete] No records found for ID: ${id}`);
      return true; // Consider it deleted if nothing found
    }

    console.log(`[PermanentDelete] Deleting ${items.length} records for Notification ${id}`);

    // 2. Delete each item
    const deletePromises = items.map((item: any) => 
      deleteDynamoDB(item.pk, item.sk)
    );
    
    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    logErrorLocation(
      "notificationService.ts",
      "permanentDeleteNotification",
      error,
      "DB error while permanently deleting notification (DynamoDB)",
      "",
      { id },
    );
    throw error;
  }
}

/**
 * Bulk permanent delete of multiple notifications.
 * Each notification has multiple related entries (meta, detail, counts), 
 * so we rely on the single permanentDeleteNotification logic for each.
 */
export async function bulkPermanentDeleteNotifications(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  
  // Running in sequence or semi-parallel to avoid DynamoDB throttling if IDs list is huge
  // For small-to-medium batches, Promise.all is fine.
  await Promise.all(ids.map(id => permanentDeleteNotification(id)));
  return true;
}
