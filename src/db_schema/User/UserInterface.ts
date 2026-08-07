export interface IUser {
    /* Keys */
    pk?: string; // User#
    sk?: string; // User#<sub>

    /* Basic Info */
    email: string;
    given_name: string;
    family_name: string;
    gender: string;
    dob?: string;
    /** E.164 format (e.g. "+919876543210"). Required for WhatsApp delivery. */
    phone?: string;

    /* Location & Identity */
    state: string;
    category: string; // General, OBC, SC, ST, etc.

    /* Education */
    qualification: string; // 10th, 12th, Graduate, etc.
    specialization?: string;
    min_percentage?: number;
    /** Percentage/CGPA-equivalent the user actually obtained in their highest qualification. Used for eligibility checks. */
    qualification_percentage?: number;

    /* Flags/Meta */
    is_verified?: boolean;
    created_at?: number;
    modified_at?: number;
    auth_provider?: 'email' | 'google';
    sub?: string;

    /* Admin Role & Permissions */
    admin_role?: AdminRole | null;
    admin_permissions?: IAdminPermissions | null;

    /* Notification Delivery Preferences */
    /** Default true — undefined is treated as enabled for pre-existing users. */
    email_notifications?: boolean;
    /** Default true — undefined is treated as enabled for pre-existing users. */
    whatsapp_notifications?: boolean;
    /** Topic keys (see TOPICS in utils/topicUtils.ts). Empty/undefined = no filter, receive all topics. */
    subscribed_topics?: string[];
}

export type AdminRole = "creator" | "reviewer" | "senior_reviewer" | "admin";

export type DataWindow =
    | "last_1_month"
    | "last_2_months"
    | "last_3_months"
    | "last_6_months"
    | "last_1_year"
    | "all";

export interface IAdminPermissions {
    /** Allowed notification categories. ["all"] = unrestricted */
    categories: string[];
    /** Allowed state codes. ["all"] = unrestricted */
    states: string[];
    /** Data time window. "all" = no restriction */
    data_window: DataWindow;
    /** Sub of the admin who assigned this role */
    assigned_by?: string;
    /** Timestamp when the role was assigned */
    assigned_at?: number;
}
