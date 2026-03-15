/**
 * User Activity Status - follows strict precedence:
 * APPLIED → ADMIT_CARD → RESULT → SELECTED
 * Each step can only be reached after completing the previous one.
 */
export enum USER_ACTIVITY_STATUS {
  WISHLISTED = 0,
  APPLIED = 1,
  ADMIT_CARD = 2,
  RESULT = 3,
  SELECTED = 4,
}

/**
 * Ordered list defining the strict progression sequence.
 * Index 0 = first step, Index 3 = final step.
 */
export const ACTIVITY_STATUS_ORDER: USER_ACTIVITY_STATUS[] = [
  USER_ACTIVITY_STATUS.WISHLISTED,
  USER_ACTIVITY_STATUS.APPLIED,
  USER_ACTIVITY_STATUS.ADMIT_CARD,
  USER_ACTIVITY_STATUS.RESULT,
  USER_ACTIVITY_STATUS.SELECTED,
];

export const USER_ACTIVITY = {
  pk: "pk",
  sk: "sk",
  notification_title: "notification_title",
  notification_category: "notification_category",
  status: "status",
  created_at: "created_at",
  modified_at: "modified_at",
} as const;
