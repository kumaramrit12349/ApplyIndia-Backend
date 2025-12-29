import { NotificationForm, NotificationListItem } from "../@types/notification";
import { pool } from "../config/pgConfig";
import {
  Notification,
  NotificationListResponse,
  NotificationRow,
} from "../models/Notification";
import { NOTIFICATION_COLUMNS as C } from "../constant/Notification";
import {
  ALL_TABLE_NAME,
  NOTIFICATION_CATEGORIES,
} from "../constant/sharedConstant";
import { logErrorLocation } from "../utils/errorUtils";

// Add complete notification with all related tables
export async function addCompleteNotification(data: NotificationForm) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const query = `
      INSERT INTO notifications (
        ${C.TITLE},
        ${C.CATEGORY},
        ${C.DEPARTMENT},
        ${C.TOTAL_VACANCIES},
        ${C.SHORT_DESCRIPTION},
        ${C.LONG_DESCRIPTION},

        ${C.HAS_ADMIT_CARD},
        ${C.HAS_RESULT},
        ${C.HAS_ANSWER_KEY},

        ${C.START_DATE},
        ${C.LAST_DATE_TO_APPLY},
        ${C.EXAM_DATE},
        ${C.ADMIT_CARD_AVAILABLE_DATE},
        ${C.RESULT_DATE},
        ${C.IMPORTANT_DATE_DETAILS},

        ${C.GENERAL_FEE},
        ${C.OBC_FEE},
        ${C.SC_FEE},
        ${C.ST_FEE},
        ${C.PH_FEE},
        ${C.OTHER_FEE_DETAILS},

        ${C.MIN_AGE},
        ${C.MAX_AGE},
        ${C.AGE_RELAXATION_DETAILS},

        ${C.QUALIFICATION},
        ${C.SPECIALIZATION},
        ${C.MIN_PERCENTAGE},
        ${C.ADDITIONAL_DETAILS},

        ${C.YOUTUBE_LINK},
        ${C.APPLY_ONLINE_URL},
        ${C.NOTIFICATION_PDF_URL},
        ${C.OFFICIAL_WEBSITE_URL},
        ${C.ADMIT_CARD_URL},
        ${C.ANSWER_KEY_URL},
        ${C.RESULT_URL},
        ${C.OTHER_LINKS}
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,
        $7,$8,$9,
        $10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,
        $22,$23,$24,
        $25,$26,$27,$28,
        $29,$30,$31,$32,$33,$34,$35,$36
      )
      RETURNING id
    `;
    const values = [
      data.title,
      data.category,
      data.department || null,
      data.total_vacancies,

      data.short_description,
      data.long_description,

      data.has_admit_card,
      data.has_result,
      data.has_answer_key,

      data.start_date,
      data.last_date_to_apply,
      data.exam_date || null,
      data.admit_card_available_date || null,
      data.result_date || null,
      data.important_date_details || null,

      data.general_fee,
      data.obc_fee,
      data.sc_fee,
      data.st_fee,
      data.ph_fee,
      data.other_fee_details,

      data.min_age,
      data.max_age,
      data.age_relaxation_details,

      data.qualification,
      data.specialization,
      data.min_percentage,
      data.additional_details || null,

      data.youtube_link,
      data.apply_online_url,
      data.notification_pdf_url,
      data.official_website_url,
      data.admit_card_url || null,
      data.answer_key_url || null,
      data.result_url || null,
      data.other_links || null,
    ];
    const result = await client.query(query, values);
    await client.query("COMMIT");
    return {
      success: true,
      notificationId: result.rows[0].id,
      message: "Notification created successfully",
    };
  } catch (error: unknown) {
    // rollback best-effort; ignore rollback failure but still log root error
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "ROLLBACK failed in addCompleteNotification:",
        rollbackError
      );
    }

    logErrorLocation(
      "notificationService.ts",
      "addCompleteNotification",
      error,
      "DB error while creating notification",
      "",
      { data }
    );

    // let upper layer decide HTTP response (e.g., 500)
    throw error;
  } finally {
    client.release();
  }
}

// View all notifications (excluding archived)
export async function viewNotifications(): Promise<NotificationListItem[]> {
  const query = `
    SELECT
      ${C.ID},
      ${C.TITLE},
      ${C.CATEGORY},
      ${C.CREATED_AT},
      ${C.IS_ARCHIVED},
      ${C.APPROVED_AT}
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ORDER BY ${C.CREATED_AT} DESC
  `;
  try {
    const result = await pool.query<NotificationListItem>(query);
    return result.rows;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "viewNotifications",
      error,
      "DB error while fetching notifications list",
      query,
      {}
    );
    // Re-throw so controller/middleware can send appropriate HTTP status
    throw error;
  }
}

// Get single notification by ID with all related data
export async function getNotificationBySlug(
  slug: string
): Promise<Notification | null> {
  console.log('slug', slug);
  const columnCheckQuery = `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name = $2
  `;
  const query = `
    SELECT *
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    WHERE ${C.SLUG} = $1
    LIMIT 1
  `;
  try {
    // Optional backward-compatibility check (kept but not used)
    await pool.query(columnCheckQuery, [
      ALL_TABLE_NAME.NOTIFICATION,
      C.IS_ARCHIVED,
    ]);
    const result = await pool.query<Notification>(query, [slug]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationById",
      error,
      "DB error while fetching notification by id",
      query,
      { slug }
    );
    throw error;
  }
}

// Get single notification by ID with all related data
export async function getNotificationById(
  id: string
): Promise<Notification | null> {
  console.log('id', id);
  const columnCheckQuery = `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name = $2
  `;
  const query = `
    SELECT *
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    WHERE ${C.ID} = $1
    LIMIT 1
  `;
  try {
    // Optional backward-compatibility check (kept but not used)
    await pool.query(columnCheckQuery, [
      ALL_TABLE_NAME.NOTIFICATION,
      C.IS_ARCHIVED,
    ]);
    const result = await pool.query<Notification>(query, [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationById",
      error,
      "DB error while fetching notification by id",
      query,
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const query = `
      UPDATE notifications
      SET
        ${C.TITLE} = $1,
        ${C.CATEGORY} = $2,
        ${C.DEPARTMENT} = $3,
        ${C.TOTAL_VACANCIES} = $4,

        ${C.SHORT_DESCRIPTION} = $5,
        ${C.LONG_DESCRIPTION} = $6,

        ${C.HAS_ADMIT_CARD} = $7,
        ${C.HAS_RESULT} = $8,
        ${C.HAS_ANSWER_KEY} = $9,

        ${C.START_DATE} = $10,
        ${C.LAST_DATE_TO_APPLY} = $11,
        ${C.EXAM_DATE} = $12,
        ${C.ADMIT_CARD_AVAILABLE_DATE} = $13,
        ${C.RESULT_DATE} = $14,
        ${C.IMPORTANT_DATE_DETAILS} = $15,

        ${C.GENERAL_FEE} = $16,
        ${C.OBC_FEE} = $17,
        ${C.SC_FEE} = $18,
        ${C.ST_FEE} = $19,
        ${C.PH_FEE} = $20,
        ${C.OTHER_FEE_DETAILS} = $21,

        ${C.MIN_AGE} = $22,
        ${C.MAX_AGE} = $23,
        ${C.AGE_RELAXATION_DETAILS} = $24,

        ${C.QUALIFICATION} = $25,
        ${C.SPECIALIZATION} = $26,
        ${C.MIN_PERCENTAGE} = $27,
        ${C.ADDITIONAL_DETAILS} = $28,

        ${C.YOUTUBE_LINK} = $29,
        ${C.APPLY_ONLINE_URL} = $30,
        ${C.NOTIFICATION_PDF_URL} = $31,
        ${C.OFFICIAL_WEBSITE_URL} = $32,
        ${C.ADMIT_CARD_URL} = $33,
        ${C.ANSWER_KEY_URL} = $34,
        ${C.RESULT_URL} = $35,
        ${C.OTHER_LINKS} = $36,
        updated_at = NOW()
      WHERE id = $37
      RETURNING id;
    `;
    const values = [
      data.title,
      data.category,
      data.department || null,
      data.total_vacancies,

      data.short_description,
      data.long_description,

      data.has_admit_card,
      data.has_result,
      data.has_answer_key,

      data.start_date,
      data.last_date_to_apply,
      data.exam_date || null,
      data.admit_card_available_date || null,
      data.result_date || null,
      data.important_date_details || null,

      data.general_fee,
      data.obc_fee,
      data.sc_fee,
      data.st_fee,
      data.ph_fee,
      data.other_fee_details,

      data.min_age,
      data.max_age,
      data.age_relaxation_details,

      data.qualification,
      data.specialization,
      data.min_percentage,
      data.additional_details || null,

      data.youtube_link,
      data.apply_online_url,
      data.notification_pdf_url,
      data.official_website_url,
      data.admit_card_url || null,
      data.answer_key_url || null,
      data.result_url || null,
      data.other_links || null,

      id,
    ];
    const result = await client.query(query, values);
    await client.query("COMMIT");
    return {
      success: true,
      notificationId: result.rows[0].id,
      message: "Notification updated successfully",
    };
  } catch (error: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "ROLLBACK failed in editCompleteNotification:",
        rollbackError
      );
    }
    logErrorLocation(
      "notificationService.ts",
      "editCompleteNotification",
      error,
      "DB error while editing notification",
      "",
      { id, data }
    );
    throw error;
  } finally {
    client.release();
  }
}

// Approve notification
export async function approveNotification(id: string, approvedBy: string) {
  const query = `
    UPDATE notifications 
    SET 
      ${C.APPROVED_AT} = NOW(),
      ${C.APPROVED_BY} = $1
    WHERE ${C.ID} = $2
    RETURNING *;
  `;
  const values = [approvedBy, id];
  try {
    const result = await pool.query<Notification>(query, values);
    return result.rows[0] || null;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "approveNotification",
      error,
      "DB error while approving notification",
      query,
      { id, approvedBy }
    );
    throw error;
  }
}

// Archive notification (soft delete)
export async function archiveNotification(id: string) {
  const query = `
    UPDATE notifications 
    SET ${C.IS_ARCHIVED} = true,
        ${C.UPDATED_AT} = NOW()
    WHERE ${C.ID} = $1
    RETURNING *;
  `;
  try {
    const result = await pool.query<Notification>(query, [id]);
    return result.rows[0] || null;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "archiveNotification",
      error,
      "DB error while archiving notification",
      query,
      { id }
    );
    throw error;
  }
}


// Unarchive notification
export async function unarchiveNotification(id: string) {
  const query = `
    UPDATE ${ALL_TABLE_NAME.NOTIFICATION}
    SET ${C.IS_ARCHIVED} = false,
        ${C.UPDATED_AT} = NOW()
    WHERE ${C.ID} = $1
    RETURNING *;
  `;
  try {
    const result = await pool.query<Notification>(query, [id]);
    return result.rows[0] || null;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "unarchiveNotification",
      error,
      "DB error while unarchiving notification",
      query,
      { id }
    );
    throw error;
  }
}

// Fetch notifications for home page, filtered to approved (and non-archived when column exists),
// then group them by category for sections like Jobs, Results
export async function getHomePageNotifications(): Promise<
  Record<string, Array<{ title: string; slug: string }>>
> {
  // 1) Check if `is_archived` column exists (backward compatibility)
  const columnCheckResult = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name = $2
    `,
    [ALL_TABLE_NAME.NOTIFICATION, C.IS_ARCHIVED] // 'notifications', 'is_archived'
  );
  const hasIsArchived =
    columnCheckResult.rowCount != null && columnCheckResult.rowCount > 0;
  // 2) Build WHERE clause: if column exists, filter on it; otherwise just use approved_at
  const whereClause = hasIsArchived
    ? `WHERE ${C.IS_ARCHIVED} = FALSE AND approved_at IS NOT NULL`
    : `WHERE approved_at IS NOT NULL`;
  const query = `
    SELECT ${C.TITLE}, ${C.SLUG}, ${C.HAS_SYLLABUS}, ${C.HAS_ADMIT_CARD}, ${C.HAS_ANSWER_KEY}, ${C.HAS_RESULT}, ${C.CATEGORY} AS category
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ${whereClause}
    ORDER BY ${C.CREATED_AT} DESC
  `;
  try {
    const result = await pool.query(query);
    // 3) Group notifications by category
    const grouped: Record<string, Array<{ title: string; slug: string }>> = {};
    // Group notifications by primary category first, then create additional groups for notifications
    // with specific flags (has_admit_card → "admit-card", has_syllabus → "syllabus", etc.) [web:188]
    for (const n of result.rows) {
      const category = n?.category || "Uncategorized";

      // 1. Always add to primary category
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({
        title: n.title,
        slug: n.slug,
      });

      // 2. Add to special categories if flags are true
      if (n.has_admit_card) {
        if (!grouped[NOTIFICATION_CATEGORIES.ADMIT_CARD])
          grouped[NOTIFICATION_CATEGORIES.ADMIT_CARD] = [];
        grouped[NOTIFICATION_CATEGORIES.ADMIT_CARD].push({
          title: n.title,
          slug: n.slug,
        });
      }

      if (n.has_syllabus) {
        if (!grouped[NOTIFICATION_CATEGORIES.SYLLABUS])
          grouped[NOTIFICATION_CATEGORIES.SYLLABUS] = [];
        grouped[NOTIFICATION_CATEGORIES.SYLLABUS].push({
          title: n.title,
          slug: n.slug
        });
      }

      if (n.has_answer_key) {
        if (!grouped[NOTIFICATION_CATEGORIES.ANSWER_KEY])
          grouped[NOTIFICATION_CATEGORIES.ANSWER_KEY] = [];
        grouped[NOTIFICATION_CATEGORIES.ANSWER_KEY].push({
          title: n.title,
          slug: n.slug,
        });
      }

      if (n.has_result) {
        if (!grouped[NOTIFICATION_CATEGORIES.RESULT])
          grouped[NOTIFICATION_CATEGORIES.RESULT] = [];
        grouped[NOTIFICATION_CATEGORIES.RESULT].push({
          title: n.title,
          slug: n.slug,
        });
      }
    }
    return grouped;
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "getHomePageNotifications",
      error,
      "DB error while fetching home page notifications",
      query,
      {}
    );
    throw error;
  }
}

// List notifications by category with pagination and optional search,
// always returning only approved and non-archived records plus total count/hasMore.
export async function getNotificationsByCategory(
  category: string,
  page: number,
  limit: number,
  searchValue?: string
): Promise<NotificationListResponse> {
  const offset = (page - 1) * limit;
  const whereClauses: string[] = [
    `${C.IS_ARCHIVED} = FALSE`,
    `${C.APPROVED_AT} IS NOT NULL`,
  ];
  const params: any[] = [];
  // Category filter (skip "all")
  if (category && category.toLowerCase() !== "all") {
    whereClauses.push(`${C.CATEGORY} = $${params.length + 1}`);
    params.push(category);
  }
  // Search filter
  if (
    searchValue &&
    typeof searchValue === "string" &&
    searchValue.trim() !== ""
  ) {
    const likeParam1 = `$${params.length + 1}`;
    const likeParam2 = `$${params.length + 2}`;
    whereClauses.push(
      `(LOWER(${C.TITLE}) LIKE ${likeParam1} OR LOWER(${C.DEPARTMENT}) LIKE ${likeParam2})`
    );
    const pattern = `%${searchValue.toLowerCase()}%`;
    params.push(pattern, pattern);
  }
  const where = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";
  // Add LIMIT and OFFSET as final params
  const limitParamIdx = params.length + 1;
  const offsetParamIdx = params.length + 2;
  params.push(limit, offset);
  const notificationsSql = `
    SELECT ${C.ID}, ${C.TITLE}
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ${where}
    ORDER BY ${C.CREATED_AT} DESC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;
  // Count query (no limit/offset)
  const countSql = `
    SELECT COUNT(*) AS total
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ${where}
  `;
  const countParams = params.slice(0, -2);
  try {
    const result = await pool.query<NotificationRow>(notificationsSql, params);
    const countResult = await pool.query<{ total: string }>(
      countSql,
      countParams
    );
    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
    const rowCount = result.rowCount ?? 0;
    const hasMore = offset + rowCount < total;

    const data = result.rows.map((row) => ({
      title: row.title,
      id: String(row.id),
    }));
    return { data, total, page, hasMore };
  } catch (error: unknown) {
    logErrorLocation(
      "notificationService.ts",
      "getNotificationsByCategory",
      error,
      "DB error while fetching notifications by category",
      { notificationsSql, countSql } as any,
      { category, page, limit, searchValue }
    );
    throw error;
  }
}

