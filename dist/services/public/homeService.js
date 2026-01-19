"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHomePageNotifications = getHomePageNotifications;
exports.getNotificationsByCategory = getNotificationsByCategory;
const NotificationConstant_1 = require("../../db_schema/Notification/NotificationConstant");
const SharedConstant_1 = require("../../db_schema/shared/SharedConstant");
const fetchCalls_1 = require("../../Interpreter/dynamoDB/fetchCalls");
const errorUtils_1 = require("../../utils/errorUtils");
// Fetch notifications for home page, filtered to approved (and non-archived when column exists),
// then group them by category for sections like Jobs, Results
async function getHomePageNotifications() {
    try {
        const items = await (0, fetchCalls_1.fetchDynamoDB)(SharedConstant_1.ALL_TABLE_NAME.Notification, undefined, [
            NotificationConstant_1.NOTIFICATION.sk,
            NotificationConstant_1.NOTIFICATION.title,
            NotificationConstant_1.NOTIFICATION.category,
            NotificationConstant_1.NOTIFICATION.created_at,
            NotificationConstant_1.NOTIFICATION.has_admit_card,
            NotificationConstant_1.NOTIFICATION.has_syllabus,
            NotificationConstant_1.NOTIFICATION.has_answer_key,
            NotificationConstant_1.NOTIFICATION.has_result,
            NotificationConstant_1.NOTIFICATION.approved_at,
            NotificationConstant_1.NOTIFICATION.approved_by,
            NotificationConstant_1.NOTIFICATION.type,
        ], {
            [NotificationConstant_1.NOTIFICATION.type]: NotificationConstant_1.NOTIFICATION_TYPE.META,
            [NotificationConstant_1.NOTIFICATION.approved_by]: "admin",
        }, "#type = :type AND #approved_by = :approved_by", undefined, false // exclude archived
        );
        // Extra safety: ensure approved_at exists and is number
        const approved = items.filter((n) => typeof n.approved_at === "number");
        // Sort latest first
        approved.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
        const grouped = {};
        const pushWithLimit = (key, item, limit = 10) => {
            if (!grouped[key])
                grouped[key] = [];
            if (grouped[key].length < limit) {
                grouped[key].push(item);
            }
        };
        for (const n of approved) {
            const sk = n
                .sk.replace(`${SharedConstant_1.TABLE_PK_MAPPER.Notification}`, "")
                .replace("#META", "");
            const baseItem = {
                title: n.title,
                sk,
            };
            // Primary category
            pushWithLimit(n.category || "Uncategorized", baseItem);
            // Virtual categories
            if (n.has_admit_card) {
                pushWithLimit(SharedConstant_1.NOTIFICATION_CATEGORIES.ADMIT_CARD, baseItem);
            }
            if (n.has_syllabus) {
                pushWithLimit(SharedConstant_1.NOTIFICATION_CATEGORIES.SYLLABUS, baseItem);
            }
            if (n.has_answer_key) {
                pushWithLimit(SharedConstant_1.NOTIFICATION_CATEGORIES.ANSWER_KEY, baseItem);
            }
            if (n.has_result) {
                pushWithLimit(SharedConstant_1.NOTIFICATION_CATEGORIES.RESULT, baseItem);
            }
        }
        return grouped;
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "getHomePageNotifications", error, "DB error while fetching home page notifications (DynamoDB)", "", {});
        throw error;
    }
}
// List notifications by category with pagination and optional search,
async function getNotificationsByCategory(category, limit, lastEvaluatedKeySk, // ONLY sk from frontend
searchValue) {
    try {
        /* ================= PAGINATION ================= */
        let lastEvaluatedKey;
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
        const queryFilter = {
            type: NotificationConstant_1.NOTIFICATION_TYPE.META,
            approved_by: "admin",
        };
        let filterString = "#type=:type and #approved_by=:approved_by";
        /* ================= CATEGORY LOGIC ================= */
        const specialCategoryFlags = {
            [SharedConstant_1.NOTIFICATION_CATEGORIES.ADMIT_CARD]: NotificationConstant_1.NOTIFICATION.has_admit_card,
            [SharedConstant_1.NOTIFICATION_CATEGORIES.SYLLABUS]: NotificationConstant_1.NOTIFICATION.has_syllabus,
            [SharedConstant_1.NOTIFICATION_CATEGORIES.ANSWER_KEY]: NotificationConstant_1.NOTIFICATION.has_answer_key,
            [SharedConstant_1.NOTIFICATION_CATEGORIES.RESULT]: NotificationConstant_1.NOTIFICATION.has_result,
        };
        if (normalizedCategory !== "all") {
            const flag = specialCategoryFlags[normalizedCategory];
            if (flag) {
                queryFilter[flag] = true;
                filterString += ` and ${flag}=:${flag}`;
            }
            else {
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
        const result = await (0, fetchCalls_1.fetchDynamoDBWithLimit)(SharedConstant_1.ALL_TABLE_NAME.Notification, limit, lastEvaluatedKey, [
            NotificationConstant_1.NOTIFICATION.sk,
            NotificationConstant_1.NOTIFICATION.title,
            NotificationConstant_1.NOTIFICATION.created_at,
            NotificationConstant_1.NOTIFICATION.category,
            NotificationConstant_1.NOTIFICATION.has_admit_card,
            NotificationConstant_1.NOTIFICATION.has_answer_key,
            NotificationConstant_1.NOTIFICATION.has_result,
            NotificationConstant_1.NOTIFICATION.has_syllabus,
            NotificationConstant_1.NOTIFICATION.type,
        ], queryFilter, filterString);
        /* ================= SORT ================= */
        result.results.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
        /* ================= RESPONSE ================= */
        return {
            data: result.results.map((n) => ({
                title: n.title,
                id: n
                    .sk.replace(`${SharedConstant_1.TABLE_PK_MAPPER.Notification}`, "")
                    .replace("#META", ""),
            })),
            lastEvaluatedKey: result.lastEvaluatedKey?.sk, // ✅ ONLY sk
        };
    }
    catch (error) {
        (0, errorUtils_1.logErrorLocation)("notificationService.ts", "getNotificationsByCategory", error, "DB error while fetching notifications by category (DynamoDB)", "", { category, limit, lastEvaluatedKeySk, searchValue });
        throw error;
    }
}
