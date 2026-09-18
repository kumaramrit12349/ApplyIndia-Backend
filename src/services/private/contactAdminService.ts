import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { CONTACT_ITEM_TYPE, CONTACT_STATUS, CONTACT_SUB_ITEM_TYPE } from "../../db_schema/Contact/ContactConstant";
import { IContact, IContactNote, IContactReply } from "../../db_schema/Contact/ContactInterface";
import { fetchDynamoDB, fetchDynamoDBWithLimit } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { sendEmail } from "../external/emailService";
import { renderEmailTemplate } from "./emailTemplateService";
import { EMAIL_TEMPLATE_KEYS } from "../../db_schema/EmailTemplate/EmailTemplateConstant";
import { logErrorLocation } from "../../utils/errorUtils";

export interface IListContactsForAdminOpts {
  search?: string;
  searchField?: "reference_id" | "name" | "email" | "message" | "page_url";
  category?: string;
  status?: string;
  priority?: string;
  is_spam?: boolean;
  /** Epoch ms lower bound — only submissions created at/after this instant. */
  dateFrom?: number;
  /** Epoch ms upper bound (exclusive) — only meaningful paired with dateFrom (e.g. "Yesterday" = [startOfYesterday, startOfToday)); ignored on its own. */
  dateTo?: number;
  limit: number;
  startKey?: Record<string, any>;
}

export async function listContactsForAdmin(
  opts: IListContactsForAdminOpts
): Promise<{ results: IContact[]; lastEvaluatedKey?: { pk: string; sk: string } }> {
  try {
    // Always scope to real submissions — NOTE/REPLY sub-items share this
    // same Contact# partition and must never surface as their own rows here.
    const queryFilter: Record<string, any> = { type: CONTACT_ITEM_TYPE.SUBMISSION };
    const clauses: string[] = ["#type = :type"];
    if (opts.category) {
      queryFilter.category = opts.category;
      clauses.push("#category = :category");
    }
    if (opts.status) {
      queryFilter.status = opts.status;
      clauses.push("#status = :status");
    }
    if (opts.priority) {
      queryFilter.priority = opts.priority;
      clauses.push("#priority = :priority");
    }
    if (opts.is_spam !== undefined) {
      queryFilter.is_spam = opts.is_spam;
      clauses.push("#is_spam = :is_spam");
    }
    if (opts.search && opts.searchField) {
      queryFilter[opts.searchField] = opts.search;
      clauses.push(`contains(#${opts.searchField}, :${opts.searchField})`);
    }
    if (opts.dateFrom !== undefined) {
      // The upper bound is nested inside this block deliberately: #created_at
      // only gets a valid name mapping when "created_at" is a queryFilter
      // key, so a dateTo clause is only ever added alongside a dateFrom one
      // — never on its own — to guarantee that mapping exists. The second
      // clause reuses the same #created_at name with a different value
      // placeholder (:date_to), which fetchDynamoDBWithLimit's name/value
      // derivation supports fine since it matches purely on substring
      // presence in the filter string, not on clause structure.
      queryFilter.created_at = opts.dateFrom;
      clauses.push("#created_at >= :created_at");
      if (opts.dateTo !== undefined) {
        queryFilter.date_to = opts.dateTo;
        clauses.push("#created_at < :date_to");
      }
    }
    return await fetchDynamoDBWithLimit<IContact>(
      ALL_TABLE_NAMES.Contact,
      opts.limit,
      opts.startKey,
      ["*"],
      queryFilter,
      clauses.join(" and "),
      false
    );
  } catch (error) {
    logErrorLocation("contactAdminService.ts", "listContactsForAdmin", error, "Error listing contacts for admin", "", opts);
    throw error;
  }
}

/**
 * Trash/spam-review view. fetchDynamoDBWithLimit's underlying pagination call
 * unconditionally excludes archived items with no override, so soft-deleted
 * submissions can only be listed via this non-paginated full-scan path
 * (mirrors how Notification's own "Archived" admin tab works) — fine at this
 * feature's expected volume.
 */
export async function listArchivedContacts(): Promise<IContact[]> {
  try {
    const all = await fetchDynamoDB<IContact>(ALL_TABLE_NAMES.Contact, undefined, ["*"], undefined, undefined, undefined, true);
    return all.filter((c) => c.type === CONTACT_ITEM_TYPE.SUBMISSION && c.is_archived);
  } catch (error) {
    logErrorLocation("contactAdminService.ts", "listArchivedContacts", error, "Error listing archived contacts", "", {});
    throw error;
  }
}

/**
 * sk prefix for a NOTE/REPLY sub-item under one contact. Deliberately uses
 * the contact's bare ulid (stripping the "Contact#" pk prefix) rather than
 * its full sk — `pk` already establishes the partition, so repeating
 * "Contact#" inside the sk too is pure noise, not information. The prefix
 * still has to include the parent's ulid at all (not just live on the
 * `contact_id` attribute) because DynamoDB can only scope a query cheaply
 * via begins_with on the sort key — every Contact-related item in the app
 * shares one partition, so without this prefix, listing one contact's
 * replies/notes would mean scanning that entire partition instead of
 * jumping straight to this contact's range.
 */
function subItemSkPrefix(contactSk: string, subType: string): string {
  const bareId = contactSk.slice(TABLE_PK_MAPPER.Contact.length);
  return `${bareId}#${subType}#`;
}

export async function getContactBySk(sk: string): Promise<IContact | null> {
  const results = await fetchDynamoDB<IContact>(ALL_TABLE_NAMES.Contact, sk);
  return results[0] || null;
}

export async function updateContactStatus(sk: string, status: CONTACT_STATUS): Promise<void> {
  const updates: Record<string, any> = { status };
  if (status === CONTACT_STATUS.RESOLVED || status === CONTACT_STATUS.CLOSED) {
    updates.resolved_at = Date.now();
  }
  await updateDynamoDB(TABLE_PK_MAPPER.Contact, sk, updates);
}

export async function updateContactPriority(sk: string, priority: string): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.Contact, sk, { priority });
}

export async function setContactSpam(sk: string, isSpam: boolean): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.Contact, sk, { is_spam: isSpam });
}

export async function softDeleteContact(sk: string): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.Contact, sk, { is_archived: true });
}

export async function bulkSoftDeleteContacts(sks: string[]): Promise<void> {
  if (!sks || sks.length === 0) return;
  await Promise.all(sks.map((sk) => softDeleteContact(sk)));
}

export async function restoreContact(sk: string): Promise<void> {
  await updateDynamoDB(TABLE_PK_MAPPER.Contact, sk, { is_archived: false });
}

/**
 * Hard delete — removes the contact row plus every NOTE/REPLY sub-item under
 * it (they share this contact's partition/sk-prefix, so soft-deleting or
 * removing only the parent row would otherwise orphan them). Mirrors
 * notificationService.ts's permanentDeleteNotification for the same
 * parent-plus-sub-items shape. Only ever called on an already-archived
 * (trashed) submission from the admin UI — there is no confirmation step
 * at this layer, so callers must have already gated on that.
 */
export async function permanentlyDeleteContact(sk: string): Promise<void> {
  try {
    const [notes, replies] = await Promise.all([
      getInternalNotes(sk),
      getContactReplies(sk),
    ]);
    const subItemSks = [...notes, ...replies].map((item) => item.sk);
    await Promise.all([
      deleteDynamoDB(TABLE_PK_MAPPER.Contact, sk),
      ...subItemSks.map((subSk) => deleteDynamoDB(TABLE_PK_MAPPER.Contact, subSk)),
    ]);
  } catch (error) {
    logErrorLocation("contactAdminService.ts", "permanentlyDeleteContact", error, "Error permanently deleting contact", "", { sk });
    throw error;
  }
}

export async function bulkPermanentlyDeleteContacts(sks: string[]): Promise<void> {
  if (!sks || sks.length === 0) return;
  await Promise.all(sks.map((sk) => permanentlyDeleteContact(sk)));
}

export async function addInternalNote(
  contactSk: string,
  authorSub: string,
  authorName: string | undefined,
  body: string
): Promise<IContactNote> {
  const note: IContactNote = {
    pk: TABLE_PK_MAPPER.Contact,
    sk: `${subItemSkPrefix(contactSk, CONTACT_SUB_ITEM_TYPE.NOTE)}${ulid()}`,
    type: CONTACT_ITEM_TYPE.NOTE,
    contact_id: contactSk,
    author_sub: authorSub,
    author_name: authorName,
    body,
  };
  await insertDataDynamoDB(ALL_TABLE_NAMES.Contact, note);
  return note;
}

export async function getInternalNotes(contactSk: string): Promise<IContactNote[]> {
  return fetchDynamoDB<IContactNote>(
    ALL_TABLE_NAMES.Contact,
    undefined,
    ["*"],
    undefined,
    undefined,
    undefined,
    true,
    subItemSkPrefix(contactSk, CONTACT_SUB_ITEM_TYPE.NOTE)
  );
}

export async function getContactReplies(contactSk: string): Promise<IContactReply[]> {
  return fetchDynamoDB<IContactReply>(
    ALL_TABLE_NAMES.Contact,
    undefined,
    ["*"],
    undefined,
    undefined,
    undefined,
    true,
    subItemSkPrefix(contactSk, CONTACT_SUB_ITEM_TYPE.REPLY)
  );
}

/**
 * Sends a one-way reply email to the submitter and logs it as a reply
 * sub-item. Only emails if the contact has an email on file — a guest who
 * left it blank can still be replied-to internally (the note is saved) but
 * there's nowhere to send it.
 */
export async function sendContactReply(
  contactSk: string,
  authorSub: string,
  authorName: string | undefined,
  body: string
): Promise<IContactReply> {
  const contact = await getContactBySk(contactSk);
  if (!contact) throw new Error("CONTACT_NOT_FOUND");

  const reply: IContactReply = {
    pk: TABLE_PK_MAPPER.Contact,
    sk: `${subItemSkPrefix(contactSk, CONTACT_SUB_ITEM_TYPE.REPLY)}${ulid()}`,
    type: CONTACT_ITEM_TYPE.REPLY,
    contact_id: contactSk,
    author_sub: authorSub,
    author_name: authorName,
    body,
  };
  await insertDataDynamoDB(ALL_TABLE_NAMES.Contact, reply);

  if (contact.email) {
    try {
      const rendered = await renderEmailTemplate(EMAIL_TEMPLATE_KEYS.CONTACT_REPLY, {
        name: contact.name,
        reference_id: contact.reference_id,
        reply_message: body,
      });
      if (rendered) {
        await sendEmail(contact.email, rendered.subject, rendered.html);
      } else {
        logErrorLocation(
          "contactAdminService.ts",
          "sendContactReply",
          new Error("Template not found"),
          `No email template configured for key '${EMAIL_TEMPLATE_KEYS.CONTACT_REPLY}'`,
          "",
          { contactSk }
        );
      }
    } catch (err) {
      logErrorLocation("contactAdminService.ts", "sendContactReply:sendEmail", err, "Failed to send contact reply email", "", { contactSk });
    }
  }

  return reply;
}

export interface IContactStats {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  spam: number;
}

export async function getContactStats(): Promise<IContactStats> {
  try {
    const all = await fetchDynamoDB<IContact>(ALL_TABLE_NAMES.Contact, undefined, ["*"]);
    const items = all.filter((c) => c.type === CONTACT_ITEM_TYPE.SUBMISSION && !c.is_archived);
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let spam = 0;
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
      if (item.is_spam) spam++;
    }
    return { total: items.length, byStatus, byCategory, byPriority, spam };
  } catch (error) {
    logErrorLocation("contactAdminService.ts", "getContactStats", error, "Error computing contact stats", "", {});
    throw error;
  }
}
