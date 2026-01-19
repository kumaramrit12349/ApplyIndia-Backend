"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCompleteNotification = addCompleteNotification;
exports.viewNotifications = viewNotifications;
exports.getNotificationById = getNotificationById;
exports.editCompleteNotification = editCompleteNotification;
exports.approveNotification = approveNotification;
exports.archiveNotification = archiveNotification;
exports.unarchiveNotification = unarchiveNotification;
const NotificationConstant_1 = require("../../db_schema/Notification/NotificationConstant");
const ErrorMessage_1 = require("../../db_schema/shared/ErrorMessage");
const SharedConstant_1 = require("../../db_schema/shared/SharedConstant");
const fetchCalls_1 = require("../../Interpreter/dynamoDB/fetchCalls");
const transactCall_1 = require("../../Interpreter/dynamoDB/transactCall");
const updateCalls_1 = require("../../Interpreter/dynamoDB/updateCalls");
const util_1 = require("../../library/util");
const errorUtils_1 = require("../../utils/errorUtils");
// Add complete notification with all related tables
async function addCompleteNotification(data) {
    try {
        if (!data.title || !data.category || !data.start_date) {
            throw new Error("Missing required notification fields");
        }
        const notificationId = (0, util_1.generateId)();
        const now = Date.now();
        const pk = SharedConstant_1.TABLE_PK_MAPPER.Notification;
        const base = {
            pk,
            notification_id: notificationId,
            created_at: now,
            modified_at: now,
        };
        // ✅ Normalize dates
        const startDate = (0, util_1.toEpoch)(data.start_date);
        const lastDateToApply = (0, util_1.toEpoch)(data.last_date_to_apply);
        const examDate = (0, util_1.toEpoch)(data.exam_date);
        const metaItem = {
            ...base,
            sk: `${pk}${notificationId}#META`,
            type: NotificationConstant_1.NOTIFICATION_TYPE.META,
            title: data.title,
            category: data.category || "UNKNOWN",
            department: data.department || "UNKNOWN",
            start_date: startDate,
            last_date_to_apply: lastDateToApply,
            exam_date: examDate,
            total_vacancies: data.total_vacancies,
            has_syllabus: data?.has_syllabus,
            has_admit_card: data?.has_admit_card,
            has_result: data?.has_result,
            has_answer_key: data?.has_answer_key,
            is_archived: false,
            approved_at: null,
            // ✅ GSI must also use NUMBER
            gsi1pk: `CATEGORY#${data.category || "UNKNOWN"}`,
            gsi1sk: `DATE#${lastDateToApply ?? 0}#${notificationId}`,
        };
        const detailsItem = {
            ...base,
            sk: `${pk}${notificationId}#DETAILS`,
            type: NotificationConstant_1.NOTIFICATION_TYPE.DETAILS,
            short_description: data.details?.short_description || "",
            long_description: data.details?.long_description || "",
            important_date_details: data.details?.important_date_details || "",
        };
        const feeItem = {
            ...base,
            sk: `${pk}${notificationId}#FEE`,
            type: NotificationConstant_1.NOTIFICATION_TYPE.FEE,
            ...(data.fee || {}),
        };
        const eligibilityItem = {
            ...base,
            sk: `${pk}${notificationId}#ELIGIBILITY`,
            type: NotificationConstant_1.NOTIFICATION_TYPE.ELIGIBILITY,
            ...(data.eligibility || {}),
        };
        const linksItem = {
            ...base,
            sk: `${pk}${notificationId}#LINKS`,
            type: NotificationConstant_1.NOTIFICATION_TYPE.LINKS,
            ...Object.fromEntries(Object.entries(data.links || {}).filter(([_, v]) => !!v)),
        };
        await (0, transactCall_1.insertBulkDataDynamoDB)(SharedConstant_1.ALL_TABLE_NAME.Notification, [
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
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "addCompleteNotification", error, "DB error while creating notification (DynamoDB)", "", { data });
        throw error;
    }
}
// View all notifications (excluding archived)
async function viewNotifications() {
    try {
        const notifications = await (0, fetchCalls_1.fetchDynamoDB)(SharedConstant_1.ALL_TABLE_NAME.Notification, undefined, [
            NotificationConstant_1.NOTIFICATION.pk,
            NotificationConstant_1.NOTIFICATION.sk,
            NotificationConstant_1.NOTIFICATION.title,
            NotificationConstant_1.NOTIFICATION.category,
            NotificationConstant_1.NOTIFICATION.created_at,
            NotificationConstant_1.NOTIFICATION.approved_at,
            NotificationConstant_1.NOTIFICATION.approved_by,
            NotificationConstant_1.NOTIFICATION.type,
            NotificationConstant_1.NOTIFICATION.is_archived,
        ], { [NotificationConstant_1.NOTIFICATION.type]: NotificationConstant_1.NOTIFICATION_TYPE.META }, "#type = :type");
        return notifications.sort((a, b) => b.created_at - a.created_at);
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "viewNotifications", error, "DB error while fetching notifications list (DynamoDB)", "", {});
        throw error;
    }
}
// Get single notification by ID with all related data
async function getNotificationById(id) {
    try {
        if (!id) {
            throw new Error("Invalid notification id");
        }
        const skPrefix = `${SharedConstant_1.TABLE_PK_MAPPER.Notification}${id}`;
        const items = await (0, fetchCalls_1.fetchDynamoDB)(SharedConstant_1.ALL_TABLE_NAME.Notification, undefined, NotificationConstant_1.DETAIL_VIEW_NOTIFICATION, undefined, undefined, undefined, undefined, skPrefix);
        if (!items || items.length === 0) {
            return null;
        }
        // Ensure META exists
        const meta = items.find((i) => i.type === NotificationConstant_1.NOTIFICATION_TYPE.META);
        if (!meta) {
            return null;
        }
        return (0, util_1.buildNotificationDetail)(items);
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "getNotificationById", error, "DB error while fetching notification by id (DynamoDB)", "", { id });
        throw error;
    }
}
// Edit notification with all related tables
async function editCompleteNotification(id, data) {
    try {
        console.log("data", data);
        if (!id || !data) {
            throw new Error(ErrorMessage_1.INVALID_INPUT);
        }
        const pk = SharedConstant_1.TABLE_PK_MAPPER.Notification;
        const now = Date.now();
        const updates = [];
        /* ================= META ================= */
        if (data.title ||
            data.category ||
            data.department ||
            data.start_date ||
            data.last_date_to_apply ||
            data.exam_date ||
            data.total_vacancies !== undefined) {
            updates.push((0, updateCalls_1.updateDynamoDB)(pk, `${pk}${id}#META`, {
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
            }));
        }
        /* ================= DETAILS ================= */
        if (data.details) {
            updates.push((0, updateCalls_1.updateDynamoDB)(pk, `${pk}${id}#DETAILS`, {
                ...data.details,
            }));
        }
        /* ================= FEE ================= */
        if (data.fee) {
            updates.push((0, updateCalls_1.updateDynamoDB)(pk, `${pk}${id}#FEE`, {
                ...data.fee,
            }));
        }
        /* ================= ELIGIBILITY ================= */
        if (data.eligibility) {
            updates.push((0, updateCalls_1.updateDynamoDB)(pk, `${pk}${id}#ELIGIBILITY`, {
                ...data.eligibility,
            }));
        }
        /* ================= LINKS ================= */
        if (data.links) {
            updates.push((0, updateCalls_1.updateDynamoDB)(pk, `${pk}${id}#LINKS`, {
                ...Object.fromEntries(Object.entries(data.links).filter(([_, v]) => !!v)),
            }));
        }
        await Promise.all(updates);
        return true;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "editCompleteNotification", error, "DB error while editing notification (DynamoDB)", "", { id, data });
        throw error;
    }
}
// Approve notification
async function approveNotification(id, approvedBy) {
    try {
        if (!id || !approvedBy) {
            throw new Error("Invalid approve notification input");
        }
        const pk = SharedConstant_1.TABLE_PK_MAPPER.Notification;
        const sk = `${pk}${id}#META`;
        const now = Date.now();
        const attributesToUpdate = {
            approved_at: now,
            approved_by: approvedBy,
        };
        await (0, updateCalls_1.updateDynamoDB)(pk, sk, attributesToUpdate);
        return attributesToUpdate;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "approveNotification", error, "DB error while approving notification (DynamoDB)", "", { id, approvedBy });
        throw error;
    }
}
// Archive notification (soft delete)
// Archive notification (soft delete)
async function archiveNotification(id) {
    try {
        if (!id) {
            throw new Error("Invalid notification id");
        }
        const pk = SharedConstant_1.TABLE_PK_MAPPER.Notification;
        const sk = `${pk}${id}#META`;
        const now = Date.now();
        const attributesToUpdate = {
            is_archived: true,
        };
        await (0, updateCalls_1.updateDynamoDB)(pk, sk, attributesToUpdate);
        return true;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "archiveNotification", error, "DB error while archiving notification (DynamoDB)", "", { id });
        throw error;
    }
}
// Unarchive notification
// Unarchive notification (restore)
async function unarchiveNotification(id) {
    try {
        if (!id) {
            throw new Error("Invalid notification id");
        }
        const pk = SharedConstant_1.TABLE_PK_MAPPER.Notification;
        const sk = `${pk}${id}#META`;
        const attributesToUpdate = {
            is_archived: false,
        };
        await (0, updateCalls_1.updateDynamoDB)(pk, sk, attributesToUpdate);
        return true;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "unarchiveNotification", error, "DB error while unarchiving notification (DynamoDB)", "", { id });
        throw error;
    }
}
