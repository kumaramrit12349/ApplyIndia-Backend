import { NotificationForm, NotificationListItem } from "../@types/notification";
import { pool } from "../config/pgConfig";
import {
  Notification,
  NotificationListResponse,
  NotificationRow,
} from "../models/Notification";
import { NOTIFICATION_COLUMNS as C } from "../constant/Notification";
import { ALL_TABLE_NAME } from "../constant/sharedConstant";

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

        ${C.IS_ADMIT_CARD_PUBLISHED},
        ${C.IS_RESULT_PUBLISHED},
        ${C.IS_ANSWER_KEY_PUBLISHED},

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

      data.is_admit_card_published,
      data.is_result_published,
      data.is_answer_key_published,

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
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("addCompleteNotification error:", error);
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
  const result = await pool.query<NotificationListItem>(query);
  return result.rows;
}

// Get single notification by ID with all related data
export async function getNotificationById(
  id: string
): Promise<Notification | null> {
  // Optional backward-compatibility check (kept but not used)
  const columnCheckQuery = `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name = $2
  `;
  await pool.query(columnCheckQuery, [
    ALL_TABLE_NAME.NOTIFICATION,
    C.IS_ARCHIVED,
  ]);
  const query = `
    SELECT *
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    WHERE ${C.ID} = $1
    LIMIT 1
  `;
  const result = await pool.query(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
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

        ${C.IS_ADMIT_CARD_PUBLISHED} = $7,
        ${C.IS_RESULT_PUBLISHED} = $8,
        ${C.IS_ANSWER_KEY_PUBLISHED} = $9,

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

      data.is_admit_card_published,
      data.is_result_published,
      data.is_answer_key_published,

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
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("editCompleteNotification error:", error);
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
  const result = await pool.query(query, values);
  return result.rows[0] || null;
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
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
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
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

export async function getHomePageNotifications(): Promise<
  Record<string, Array<{ name: string; notification_id: string }>>
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
    SELECT ${C.ID} AS id, ${C.TITLE} AS title, ${C.CATEGORY} AS category
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ${whereClause}
    ORDER BY ${C.CREATED_AT} DESC
  `;
  const result = await pool.query(query);
  // 3) Group notifications by category
  const grouped: Record<
    string,
    Array<{ name: string; notification_id: string }>
  > = {};
  for (const n of result.rows) {
    const category = n.category || "Uncategorized";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({
      name: n.title,
      notification_id: n.id.toString(),
    });
  }
  return grouped;
}

// Get notifications by category
export async function getNotificationsByCategory(
  category: string,
  page: number,
  limit: number,
  searchValue?: string
): Promise<NotificationListResponse> {
  const offset = (page - 1) * limit;
  const whereClauses: string[] = [
    `${C.IS_ARCHIVED} = FALSE`, // is_archived = FALSE
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
  params.push(limit); // last-1
  params.push(offset); // last
  const limitIdx = params.length - 2; // index for LIMIT value in params
  const offsetIdx = params.length - 1; // index for OFFSET value in params
  const notificationsSql = `
    SELECT ${C.ID}, ${C.TITLE}
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ${where}
    ORDER BY ${C.CREATED_AT} DESC
    LIMIT $${limitIdx + 1} OFFSET $${offsetIdx + 1}
  `;
  // Count query (no limit/offset)
  const countSql = `
    SELECT COUNT(*) AS total
    FROM ${ALL_TABLE_NAME.NOTIFICATION}
    ${where}
  `;
  const countParams = params.slice(0, params.length - 2);
  const result = await pool.query<NotificationRow>(notificationsSql, params);
  const countResult = await pool.query<{ total: string }>(
    countSql,
    countParams
  );
  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
  const rowCount = result.rowCount ?? 0;
  const hasMore = offset + rowCount < total;
  const data = result.rows.map((row) => ({
    name: row.title,
    notification_id: String(row.id),
  }));
  return { data, total, page, hasMore };
}
