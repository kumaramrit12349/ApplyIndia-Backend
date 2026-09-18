export const CONTACT = {
  pk: "pk",
  sk: "sk",

  /** Discriminates a main submission from a NOTE/REPLY sub-item sharing the same Contact# partition. */
  type: "type",
  reference_id: "reference_id",
  category: "category",
  name: "name",
  email: "email",
  user_sub: "user_sub",
  message: "message",

  page_url: "page_url",
  official_source_url: "official_source_url",
  suggested_correction: "suggested_correction",
  broken_link_url: "broken_link_url",
  company_name: "company_name",
  company_website: "company_website",

  status: "status",
  priority: "priority",
  is_spam: "is_spam",
  is_archived: "is_archived",

  submitter_ip: "submitter_ip",
  resolved_at: "resolved_at",
} as const;

export enum CONTACT_CATEGORY {
  REPORT_ERROR = "report_error",
  SUGGEST_UPDATE = "suggest_update",
  REPORT_BROKEN_LINK = "report_broken_link",
  GENERAL_QUERY = "general_query",
  BUSINESS_ENQUIRY = "business_enquiry",
  FEEDBACK = "feedback",
  OTHER = "other",
}

export enum CONTACT_STATUS {
  NEW = "new",
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  WAITING_FOR_USER = "waiting_for_user",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

export enum CONTACT_PRIORITY {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

/**
 * Values for the `type` field (see CONTACT.type above) — SUBMISSION is a
 * main Contact record; NOTE/REPLY are append-only sub-items sharing the same
 * Contact# partition (sk = `<contactSk>#NOTE#<id>` / `#REPLY#<id>`). Every
 * admin list/stats query over "real" submissions must filter on
 * type = SUBMISSION so sub-items don't get counted as their own enquiries.
 */
export enum CONTACT_ITEM_TYPE {
  SUBMISSION = "submission",
  NOTE = "note",
  REPLY = "reply",
}

/** sk infixes for the two sub-item kinds — used to build/scope their composed sk. */
export const CONTACT_SUB_ITEM_TYPE = {
  NOTE: "NOTE",
  REPLY: "REPLY",
} as const;

/** Requests from the same IP within this window count toward the rate limit. */
export const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** Max submissions allowed from one IP within the window above. */
export const CONTACT_RATE_LIMIT_MAX = 5;
