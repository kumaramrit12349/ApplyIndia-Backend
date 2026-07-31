import { IUser } from "../../db_schema/User/UserInterface";
import { INotification } from "../../db_schema/Notification/NotificationInterface";

export interface IEligibilityResult {
  eligible: boolean;
  reasons: string[];
  /** Profile field keys the user must fill in before eligibility can be evaluated. */
  missingProfileFields: string[];
}

/**
 * Ordered low → high. Mirrors the frontend's EDUCATIONAL_QUALIFICATIONS list
 * (src/constant/SharedConstant.ts) so ranks stay meaningful across both apps.
 * ITI/Diploma are lateral post-10th/12th tracks, ranked just above 12th as a
 * reasonable approximation — there's no single correct ordering for them.
 */
const QUALIFICATION_LEVELS: { value: string; rank: number; keywords: string[] }[] = [
  { value: "10th", rank: 0, keywords: ["10th", "matric", "ssc"] },
  { value: "12th", rank: 1, keywords: ["12th", "intermediate", "hsc", "senior secondary"] },
  { value: "ITI", rank: 2, keywords: ["iti"] },
  { value: "Diploma", rank: 2, keywords: ["diploma", "polytechnic"] },
  { value: "Graduate", rank: 3, keywords: ["graduate", "graduation", "bachelor", "b.a", "b.sc", "b.com", "b.tech", "bca", "b.e"] },
  { value: "Post Graduate", rank: 4, keywords: ["post graduate", "postgraduate", "master", "m.a", "m.sc", "m.com", "m.tech", "mba", "mca"] },
  { value: "PhD", rank: 5, keywords: ["phd", "doctorate"] },
];

const STATE_LABELS: Record<string, string> = {
  CT: "Central", AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh",
  AS: "Assam", BR: "Bihar", CH: "Chandigarh", CG: "Chhattisgarh",
  DN: "Dadra and Nagar Haveli and Daman and Diu", DL: "Delhi", GA: "Goa", GJ: "Gujarat",
  HR: "Haryana", HP: "Himachal Pradesh", JK: "Jammu and Kashmir", JH: "Jharkhand",
  KA: "Karnataka", KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep", MP: "Madhya Pradesh",
  MH: "Maharashtra", MN: "Manipur", ML: "Meghalaya", MZ: "Mizoram", NL: "Nagaland",
  OR: "Odisha", PY: "Puducherry", PB: "Punjab", RJ: "Rajasthan", SK: "Sikkim",
  TN: "Tamil Nadu", TG: "Telangana", TR: "Tripura", UP: "Uttar Pradesh", UK: "Uttarakhand",
  WB: "West Bengal",
};

function stateLabel(code?: string): string {
  if (!code) return code || "";
  return STATE_LABELS[code.toUpperCase()] || code;
}

/** Best-effort mapping of a free-text qualification string to a rank. Null if unrecognized. */
function resolveQualificationRank(text?: string): number | null {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  for (const level of QUALIFICATION_LEVELS) {
    if (level.keywords.some((kw) => normalized.includes(kw))) {
      return level.rank;
    }
  }
  return null;
}

function calculateAge(dob: string): number | null {
  const dobDate = new Date(dob);
  if (isNaN(dobDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dobDate.getMonth() ||
    (today.getMonth() === dobDate.getMonth() && today.getDate() >= dobDate.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

const isSpecializationUnrestricted = (text?: string): boolean => {
  if (!text) return true;
  const normalized = text.trim().toLowerCase();
  return normalized === "" || normalized === "any" || normalized.startsWith("any ") || normalized === "n/a" || normalized === "na";
};

/**
 * Determines which profile fields are required to evaluate eligibility for
 * THIS specific notification (only asks for what the notification actually checks).
 */
function requiredProfileFields(notification: INotification): string[] {
  const required: string[] = [];
  const elig = notification.eligibility;

  if ((elig?.min_age && elig.min_age > 0) || (elig?.max_age && elig.max_age > 0)) {
    required.push("dob");
  }
  if (elig?.qualification && elig.qualification.trim() !== "") {
    required.push("qualification");
  }
  if (elig?.specialization && !isSpecializationUnrestricted(elig.specialization)) {
    required.push("specialization");
  }
  if (elig?.min_percentage && elig.min_percentage > 0) {
    required.push("qualification_percentage");
  }
  if (notification.state && notification.state.toUpperCase() !== "CT") {
    required.push("state");
  }

  return required;
}

/**
 * Compares a user's profile against a notification's eligibility criteria.
 *
 * Assumptions (no single correct answer given the current schema):
 * - Age is computed as of today (the schema has no "reckoning date" field).
 * - Qualification/specialization are free text on the notification (admin form),
 *   so matching is best-effort keyword/substring based, not exact enum matching.
 */
export function checkEligibility(
  user: IUser,
  notification: INotification
): IEligibilityResult {
  const missingProfileFields = requiredProfileFields(notification).filter((field) => {
    const value = (user as any)[field];
    return value === undefined || value === null || value === "";
  });

  if (missingProfileFields.length > 0) {
    return { eligible: false, reasons: [], missingProfileFields };
  }

  const reasons: string[] = [];
  const elig = notification.eligibility;

  // --- Age ---
  if ((elig?.min_age && elig.min_age > 0) || (elig?.max_age && elig.max_age > 0)) {
    const age = user.dob ? calculateAge(user.dob) : null;
    if (age === null) {
      reasons.push("Date of birth is invalid or missing.");
    } else {
      if (elig.min_age && age < elig.min_age) {
        reasons.push(`Minimum age limit not met. You must be at least ${elig.min_age} years old.`);
      }
      if (elig.max_age && age > elig.max_age) {
        reasons.push(`Maximum age limit exceeded. You must be under ${elig.max_age} years old.`);
      }
    }
  }

  // --- Qualification ---
  if (elig?.qualification && elig.qualification.trim() !== "") {
    const requiredRank = resolveQualificationRank(elig.qualification);
    const userRank = resolveQualificationRank(user.qualification);

    if (requiredRank !== null && userRank !== null) {
      if (userRank < requiredRank) {
        reasons.push(`${elig.qualification} is required.`);
      }
    } else if (user.qualification?.trim().toLowerCase() !== elig.qualification.trim().toLowerCase()) {
      // Couldn't confidently rank one side — fall back to exact text match.
      reasons.push(`${elig.qualification} is required.`);
    }
  }

  // --- Specialization ---
  if (elig?.specialization && !isSpecializationUnrestricted(elig.specialization)) {
    const required = elig.specialization.trim().toLowerCase();
    const userSpec = (user.specialization || "").trim().toLowerCase();
    if (!userSpec.includes(required) && !required.includes(userSpec)) {
      reasons.push(`Specialization in ${elig.specialization} is required.`);
    }
  }

  // --- Percentage ---
  if (elig?.min_percentage && elig.min_percentage > 0) {
    const userPercentage = user.qualification_percentage ?? -1;
    if (userPercentage < elig.min_percentage) {
      reasons.push(`Minimum ${elig.min_percentage}% required in ${user.qualification || "your qualification"}.`);
    }
  }

  // --- Domicile ---
  if (notification.state && notification.state.toUpperCase() !== "CT") {
    if ((user.state || "").toUpperCase() !== notification.state.toUpperCase()) {
      reasons.push(`${stateLabel(notification.state)} domicile required.`);
    }
  }

  return { eligible: reasons.length === 0, reasons, missingProfileFields: [] };
}

/**
 * Fixed set of profile fields required before the "Eligible Notifications"
 * list filter can run at all (page-level gate, independent of any single
 * notification's specific requirements — see checkEligibility's per-notification
 * requiredProfileFields for that narrower use case).
 */
const CORE_ELIGIBILITY_FIELDS = ["dob", "state", "qualification", "qualification_percentage"] as const;

export function getMissingCoreProfileFields(user: IUser): string[] {
  return CORE_ELIGIBILITY_FIELDS.filter((field) => {
    const value = (user as any)[field];
    return value === undefined || value === null || value === "";
  });
}

/**
 * Filters a list of notifications down to the ones the user is eligible for.
 * A notification is excluded (not surfaced as an error) if checkEligibility
 * can't fully evaluate it (e.g. it needs a non-core field like specialization
 * that the user hasn't filled in) — we only claim eligibility when we can
 * actually confirm it.
 */
export function filterEligibleNotifications(
  user: IUser,
  notifications: INotification[]
): INotification[] {
  return notifications.filter((notification) => {
    const result = checkEligibility(user, notification);
    return result.eligible && result.missingProfileFields.length === 0;
  });
}
