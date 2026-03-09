import { fetchDynamoDBWithLimit } from "../../Interpreter/dynamoDB/fetchCalls";
import { ALL_TABLE_NAMES } from "../../db_schema/shared/SharedConstant";

export interface IAdminFeedback {
    pk: string;
    sk: string;
    name: string;
    email: string;
    message: string;
    created_at?: number;
}

export async function getAdminFeedback(
    limit: number = 30,
    startKey?: any,
    timeRange?: "today" | "last_week" | "last_month" | "last_3_months" | "last_6_months" | "all"
): Promise<{ results: IAdminFeedback[]; lastEvaluatedKey?: any }> {
    let filterString: string | undefined = undefined;
    let queryFilter: Record<string, any> | undefined = undefined;

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
            filterString = "#created_at >= :startTime";
            queryFilter = {
                created_at: "created_at",
                "startTime": startTimeMillis
            };
        }
    }

    // Use scanIndexForward = false to sort descending
    return await fetchDynamoDBWithLimit<IAdminFeedback>(
        ALL_TABLE_NAMES.Feedback,
        limit,
        startKey,
        ["*"],
        queryFilter,
        filterString,
        false
    );
}
