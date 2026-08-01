/**
 * Mirrors the frontend's INDIAN_STATES list (src/constant/SharedConstant.ts)
 * so the backend can resolve a notification/user's state to a canonical code
 * without needing to share a package between the two apps.
 */
export const INDIAN_STATES: { value: string; label: string }[] = [
  { value: "CT", label: "Central" },
  { value: "AN", label: "Andaman and Nicobar Islands" },
  { value: "AP", label: "Andhra Pradesh" },
  { value: "AR", label: "Arunachal Pradesh" },
  { value: "AS", label: "Assam" },
  { value: "BR", label: "Bihar" },
  { value: "CH", label: "Chandigarh" },
  { value: "CG", label: "Chhattisgarh" },
  { value: "DN", label: "Dadra and Nagar Haveli and Daman and Diu" },
  { value: "DL", label: "Delhi" },
  { value: "GA", label: "Goa" },
  { value: "GJ", label: "Gujarat" },
  { value: "HR", label: "Haryana" },
  { value: "HP", label: "Himachal Pradesh" },
  { value: "JK", label: "Jammu and Kashmir" },
  { value: "JH", label: "Jharkhand" },
  { value: "KA", label: "Karnataka" },
  { value: "KL", label: "Kerala" },
  { value: "LA", label: "Ladakh" },
  { value: "LD", label: "Lakshadweep" },
  { value: "MP", label: "Madhya Pradesh" },
  { value: "MH", label: "Maharashtra" },
  { value: "MN", label: "Manipur" },
  { value: "ML", label: "Meghalaya" },
  { value: "MZ", label: "Mizoram" },
  { value: "NL", label: "Nagaland" },
  { value: "OR", label: "Odisha" },
  { value: "PY", label: "Puducherry" },
  { value: "PB", label: "Punjab" },
  { value: "RJ", label: "Rajasthan" },
  { value: "SK", label: "Sikkim" },
  { value: "TN", label: "Tamil Nadu" },
  { value: "TG", label: "Telangana" },
  { value: "TR", label: "Tripura" },
  { value: "UP", label: "Uttar Pradesh" },
  { value: "UK", label: "Uttarakhand" },
  { value: "WB", label: "West Bengal" },
];

/**
 * Notifications end up with state stored in inconsistent formats depending
 * on how they were created:
 * - Admin-created: the INDIAN_STATES code, e.g. "BR" (from the dropdown).
 * - Scraper-created (src/scraper/normalizer.ts inferState): a lowercase,
 *   hyphenated slug of the state's English name, e.g. "bihar", "uttar-pradesh",
 *   or the literal word "central" for Central Government.
 *
 * This resolves any of those forms to the canonical INDIAN_STATES code, so
 * state comparisons (personalized home feed, eligibility domicile check)
 * work regardless of which path created the record.
 */
export function resolveStateCode(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase().replace(/-/g, " ");
  const match = INDIAN_STATES.find(
    (s) => s.value.toLowerCase() === normalized || s.label.toLowerCase() === normalized
  );
  return match?.value;
}
