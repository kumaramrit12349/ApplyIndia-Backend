import { CONTACT_CATEGORY, CONTACT_ITEM_TYPE, CONTACT_PRIORITY, CONTACT_STATUS } from "./ContactConstant";

export interface IContact {
  /* Keys */
  pk?: string;
  sk?: string;

  /** Always CONTACT_ITEM_TYPE.SUBMISSION — distinguishes this from a NOTE/REPLY sub-item in the same partition. */
  type: CONTACT_ITEM_TYPE.SUBMISSION;
  /** Short human-facing ID shown to the submitter (emails, confirmation screen) — derived from sk, e.g. AI-CON-20260917-4F2A9C. */
  reference_id: string;
  category: CONTACT_CATEGORY;
  name: string;
  /** Optional for a guest submitter; always set when submitted while logged in. */
  email?: string;
  /** Set only when the submitter was logged in at submission time — links back to their User# record. */
  user_sub?: string;
  message: string;

  /** The Apply India page the visitor was on when they opened the form. */
  page_url?: string;
  /** An external/official link offered as evidence — Report an Error / Suggest an Update. */
  official_source_url?: string;
  /** Suggest an Update. */
  suggested_correction?: string;
  /** Report a Broken Link — the dead URL itself, distinct from page_url ("where they found it"). */
  broken_link_url?: string;
  /** Business Enquiry. */
  company_name?: string;
  /** Business Enquiry. */
  company_website?: string;

  status: CONTACT_STATUS;
  priority: CONTACT_PRIORITY;
  /** Orthogonal to status — a spam-flagged submission can still be any status. */
  is_spam?: boolean;
  /** Soft-delete ("move to trash") — reuses the shared ARCHIVED filter machinery. */
  is_archived?: boolean;

  submitter_ip?: string;
  resolved_at?: number;
}

/** Append-only sub-item: sk = `Contact#<contactId>#NOTE#<noteId>`. Admin-only, never shown to the submitter. */
export interface IContactNote {
  pk?: string;
  sk?: string;
  type: CONTACT_ITEM_TYPE.NOTE;
  contact_id: string;
  author_sub: string;
  author_name?: string;
  body: string;
}

/** Append-only sub-item: sk = `Contact#<contactId>#REPLY#<replyId>`. The actual outbound email sent to the submitter. */
export interface IContactReply {
  pk?: string;
  sk?: string;
  type: CONTACT_ITEM_TYPE.REPLY;
  contact_id: string;
  author_sub: string;
  author_name?: string;
  body: string;
}
