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
}
