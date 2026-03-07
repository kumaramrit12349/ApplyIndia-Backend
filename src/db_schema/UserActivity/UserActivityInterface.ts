import { USER_ACTIVITY_STATUS } from "./UserActivityConstant";

export interface IUserActivity {
    /** PK = User's SK, e.g. "User#<sub>" */
    pk: string;
    /** SK = Notification SK, e.g. "Notification#<id>#META" */
    sk: string;
    /** Denormalized notification title for dashboard display */
    notification_title: string;
    /** Denormalized notification category for dashboard filtering */
    notification_category: string;
    /** Current status following precedence: APPLIED → ADMIT_CARD → RESULT → SELECTED */
    status: USER_ACTIVITY_STATUS;
    /** Number of times this tracking has been created (mark + remove counts as 1 attempt) */
    attempt_count: number;
    created_at: number;
    modified_at: number;
}

/** Maximum number of times a user can track the same notification */
export const MAX_ACTIVITY_ATTEMPTS = 2;

