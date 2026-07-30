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

    /* Location & Identity */
    state: string;
    category: string; // General, OBC, SC, ST, etc.

    /* Education */
    qualification: string; // 10th, 12th, Graduate, etc.
    specialization?: string;
    min_percentage?: number;

    /* Flags/Meta */
    is_verified?: boolean;
    created_at?: number;
    modified_at?: number;
    auth_provider?: 'email' | 'google';
    sub?: string;

    /* Admin Role & Permissions */
    admin_role?: AdminRole | null;
    admin_permissions?: IAdminPermissions | null;
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
