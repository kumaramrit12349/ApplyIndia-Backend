import {
    PutItemCommand,
    QueryCommand,
    DeleteItemCommand,
    GetItemCommand,
    UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { dynamoDBClient } from "../../aws/dynamodb.client";
import { DYNAMODB_CONFIG } from "../../config/env";
import {
    ACTIVITY_STATUS_ORDER,
    USER_ACTIVITY_STATUS,
} from "../../db_schema/UserActivity/UserActivityConstant";
import { IUserActivity, MAX_ACTIVITY_ATTEMPTS } from "../../db_schema/UserActivity/UserActivityInterface";
import { TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { logErrorLocation } from "../../utils/errorUtils";

/**
 * Validates that the requested status transition follows the strict precedence:
 * APPLIED → ADMIT_CARD → RESULT → SELECTED
 *
 * Rules:
 * - If no current activity exists, only APPLIED is allowed (first step).
 * - Otherwise, the new status must be exactly the next step after current status.
 */
function isValidStatusTransition(
    currentStatus: USER_ACTIVITY_STATUS | null,
    newStatus: USER_ACTIVITY_STATUS
): boolean {
    if (!currentStatus) {
        // First step must be WISHLISTED or APPLIED
        return newStatus === USER_ACTIVITY_STATUS.WISHLISTED || newStatus === USER_ACTIVITY_STATUS.APPLIED;
    }
    const currentIndex = ACTIVITY_STATUS_ORDER.indexOf(currentStatus);
    const newIndex = ACTIVITY_STATUS_ORDER.indexOf(newStatus);
    // Allow same status (idempotent) or the immediate next step
    return newIndex === currentIndex || newIndex === currentIndex + 1;
}

/**
 * Get the attempt count for a user + notification (persists across deletions).
 * Stored as a separate counter item: PK = User SK, SK = "ACTIVITY_HISTORY#<notificationSk>"
 */
async function getAttemptCount(
    userPk: string,
    notificationSk: string
): Promise<number> {
    try {
        const historySk = `ACTIVITY_HISTORY#${notificationSk}`;
        const result = await dynamoDBClient.send(
            new GetItemCommand({
                TableName: DYNAMODB_CONFIG.TABLE_NAME,
                Key: marshall({ pk: userPk, sk: historySk }),
            })
        );
        if (result.Item) {
            const item = unmarshall(result.Item);
            return (item.attempt_count as number) || 0;
        }
        return 0;
    } catch {
        return 0;
    }
}

/**
 * Increment attempt count (called when user first marks "APPLIED").
 */
async function incrementAttemptCount(
    userPk: string,
    notificationSk: string
): Promise<number> {
    const historySk = `ACTIVITY_HISTORY#${notificationSk}`;
    const result = await dynamoDBClient.send(
        new UpdateItemCommand({
            TableName: DYNAMODB_CONFIG.TABLE_NAME,
            Key: marshall({ pk: userPk, sk: historySk }),
            UpdateExpression: "SET attempt_count = if_not_exists(attempt_count, :zero) + :inc, modified_at = :now",
            ExpressionAttributeValues: marshall({
                ":zero": 0,
                ":inc": 1,
                ":now": Date.now(),
            }),
            ReturnValues: "ALL_NEW",
        })
    );
    const item = result.Attributes ? unmarshall(result.Attributes) : {};
    return (item.attempt_count as number) || 1;
}

/**
 * Track / update a user activity for a notification.
 * PK = User SK (e.g. "User#<sub>"), SK = Notification SK
 *
 * Enforces:
 * 1. Status precedence (APPLIED → ADMIT_CARD → RESULT → SELECTED)
 * 2. Max attempt limit (MAX_ACTIVITY_ATTEMPTS) — user cannot mark+remove more than N times
 */
export async function upsertUserActivity(
    userSub: string,
    notificationSk: string,
    notificationTitle: string,
    notificationCategory: string,
    status: USER_ACTIVITY_STATUS
): Promise<IUserActivity> {
    try {
        const pk = `${TABLE_PK_MAPPER.User}${userSub}`;
        const now = Date.now();

        // Check existing activity to enforce precedence
        const existing = await getUserActivityForNotification(userSub, notificationSk);

        if (!isValidStatusTransition(existing?.status || null, status)) {
            const currentIndex = existing
                ? ACTIVITY_STATUS_ORDER.indexOf(existing.status)
                : -1;
            const requiredStep =
                currentIndex + 1 < ACTIVITY_STATUS_ORDER.length
                    ? ACTIVITY_STATUS_ORDER[currentIndex + 1]
                    : "COMPLETED";
            throw new Error(
                `Invalid status transition. Current: ${existing?.status || "NONE"}, ` +
                `Requested: ${status}. Next allowed step: ${requiredStep}`
            );
        }

        // Check attempt limit
        let attemptCount = existing?.attempt_count || 0;
        
        // Count as a new attempt if they are tracking it for the FIRST time 
        // (meaning no existing record, or existing is exactly the same status but somehow deleted which shouldn't happen here)
        const isNewAttempt = !existing;

        if (isNewAttempt) {
            const currentAttempts = await getAttemptCount(pk, notificationSk);
            if (currentAttempts >= MAX_ACTIVITY_ATTEMPTS) {
                throw new Error(
                    `ATTEMPT_LIMIT_REACHED: You have reached the maximum limit of ${MAX_ACTIVITY_ATTEMPTS} attempts for this notification. You cannot track it again.`
                );
            }
            attemptCount = await incrementAttemptCount(pk, notificationSk);
        } else if (existing) {
            attemptCount = existing.attempt_count;
        }

        const item: IUserActivity = {
            pk,
            sk: notificationSk,
            notification_title: notificationTitle,
            notification_category: notificationCategory,
            status,
            attempt_count: attemptCount,
            created_at: existing?.created_at || now,
            modified_at: now,
        };

        await dynamoDBClient.send(
            new PutItemCommand({
                TableName: DYNAMODB_CONFIG.TABLE_NAME,
                Item: marshall(item, { removeUndefinedValues: true }),
            })
        );

        return item;
    } catch (error) {
        logErrorLocation(
            "userActivityService.ts",
            "upsertUserActivity",
            error,
            "Error while upserting user activity",
            "",
            { userSub, notificationSk, status }
        );
        throw error;
    }
}

/**
 * Get all activities for a user (for dashboard).
 */
export async function getUserActivities(
    userSub: string
): Promise<IUserActivity[]> {
    try {
        const pk = `${TABLE_PK_MAPPER.User}${userSub}`;

        const result = await dynamoDBClient.send(
            new QueryCommand({
                TableName: DYNAMODB_CONFIG.TABLE_NAME,
                KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: marshall({
                    ":pk": pk,
                    ":skPrefix": TABLE_PK_MAPPER.Notification,
                }),
            })
        );

        const items = (result.Items || []).map((item) => unmarshall(item) as IUserActivity);
        return items.sort((a, b) => b.modified_at - a.modified_at);
    } catch (error) {
        logErrorLocation(
            "userActivityService.ts",
            "getUserActivities",
            error,
            "Error while fetching user activities",
            "",
            { userSub }
        );
        throw error;
    }
}

/**
 * Get a single activity for a user + notification combination.
 */
export async function getUserActivityForNotification(
    userSub: string,
    notificationSk: string
): Promise<IUserActivity | null> {
    try {
        const pk = `${TABLE_PK_MAPPER.User}${userSub}`;

        const result = await dynamoDBClient.send(
            new GetItemCommand({
                TableName: DYNAMODB_CONFIG.TABLE_NAME,
                Key: marshall({ pk, sk: notificationSk }),
            })
        );

        return result.Item ? (unmarshall(result.Item) as IUserActivity) : null;
    } catch (error) {
        logErrorLocation(
            "userActivityService.ts",
            "getUserActivityForNotification",
            error,
            "Error while fetching user activity for notification",
            "",
            { userSub, notificationSk }
        );
        throw error;
    }
}

/**
 * Delete a tracked activity.
 * The attempt count persists in the ACTIVITY_HISTORY item (not deleted here).
 */
export async function deleteUserActivity(
    userSub: string,
    notificationSk: string
): Promise<boolean> {
    try {
        const pk = `${TABLE_PK_MAPPER.User}${userSub}`;

        await dynamoDBClient.send(
            new DeleteItemCommand({
                TableName: DYNAMODB_CONFIG.TABLE_NAME,
                Key: marshall({ pk, sk: notificationSk }),
            })
        );

        return true;
    } catch (error) {
        logErrorLocation(
            "userActivityService.ts",
            "deleteUserActivity",
            error,
            "Error while deleting user activity",
            "",
            { userSub, notificationSk }
        );
        throw error;
    }
}
