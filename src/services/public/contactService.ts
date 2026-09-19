import { ulid } from "ulid";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import {
  CONTACT_CATEGORY,
  CONTACT_ITEM_TYPE,
  CONTACT_PRIORITY,
  CONTACT_RATE_LIMIT_MAX,
  CONTACT_RATE_LIMIT_WINDOW_MS,
  CONTACT_STATUS,
} from "../../db_schema/Contact/ContactConstant";
import { IContact } from "../../db_schema/Contact/ContactInterface";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { getUserProfile, getCognitoUserEmail } from "../authService";
import { sendEmail } from "../external/emailService";
import { renderEmailTemplate } from "../private/emailTemplateService";
import { EMAIL_TEMPLATE_KEYS } from "../../db_schema/EmailTemplate/EmailTemplateConstant";
import { EMAIL_CHANNEL } from "../../db_schema/PlatformSettings/PlatformSettingsConstant";
import { EMAIL_CONFIG } from "../../config/env";
import { logErrorLocation } from "../../utils/errorUtils";

const CATEGORY_TEMPLATE_KEY: Record<CONTACT_CATEGORY, string> = {
  [CONTACT_CATEGORY.REPORT_ERROR]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_REPORT_ERROR,
  [CONTACT_CATEGORY.SUGGEST_UPDATE]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_SUGGEST_UPDATE,
  [CONTACT_CATEGORY.REPORT_BROKEN_LINK]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_BROKEN_LINK,
  [CONTACT_CATEGORY.GENERAL_QUERY]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_GENERAL_QUERY,
  [CONTACT_CATEGORY.BUSINESS_ENQUIRY]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_BUSINESS_ENQUIRY,
  [CONTACT_CATEGORY.FEEDBACK]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_FEEDBACK,
  [CONTACT_CATEGORY.OTHER]: EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_OTHER,
};

export interface ISubmitContactInput {
  category: CONTACT_CATEGORY;
  name?: string;
  email?: string;
  message: string;
  page_url?: string;
  official_source_url?: string;
  suggested_correction?: string;
  broken_link_url?: string;
  company_name?: string;
  company_website?: string;
  /** Honeypot field — a real visitor never fills this in. */
  website?: string;
}

export interface ISubmitContactContext {
  userSub?: string;
  ip: string;
}

function buildReferenceId(sk: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const ulidPart = sk.slice(TABLE_PK_MAPPER.Contact.length);
  const suffix = ulidPart.slice(-6).toUpperCase();
  return `AI-CON-${yyyy}${mm}${dd}-${suffix}`;
}

async function isRateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  const since = Date.now() - CONTACT_RATE_LIMIT_WINDOW_MS;
  const recent = await fetchDynamoDB<{ sk: string }>(
    ALL_TABLE_NAMES.Contact,
    undefined,
    ["sk"],
    { submitter_ip: ip, created_at: since },
    "#submitter_ip = :submitter_ip and #created_at > :created_at"
  );
  return recent.length >= CONTACT_RATE_LIMIT_MAX;
}

/**
 * Unlike the visitor-facing confirmations, a missing template here must
 * never mean "admin silently stops getting notified" — so this one falls
 * back to a plain hardcoded email if CONTACT_ADMIN_NOTIFY hasn't been
 * created yet, instead of renderEmailTemplate's usual "return null, skip"
 * behavior.
 */
async function sendInternalNotification(contact: IContact): Promise<void> {
  if (!EMAIL_CONFIG.contactNotificationAddress) return;

  const vars = {
    category: contact.category,
    name: contact.name,
    email: contact.email || "(not provided)",
    reference_id: contact.reference_id,
    message: contact.message,
  };

  const rendered = await renderEmailTemplate(EMAIL_TEMPLATE_KEYS.CONTACT_ADMIN_NOTIFY, vars);
  if (rendered) {
    await sendEmail(EMAIL_CONFIG.contactNotificationAddress, rendered.subject, rendered.html, EMAIL_CHANNEL.CONTACT_US);
    return;
  }

  const subject = `🔔 New Contact Enquiry — Apply India #${contact.reference_id}`;
  const html = `
    <p>A new Contact Us submission has been received.</p>
    <p><strong>Category:</strong> ${contact.category}<br/>
    <strong>Name:</strong> ${contact.name}<br/>
    <strong>Email:</strong> ${contact.email || "(not provided)"}<br/>
    <strong>Reference:</strong> ${contact.reference_id}</p>
    <p>${contact.message}</p>
  `;
  await sendEmail(EMAIL_CONFIG.contactNotificationAddress, subject, html, EMAIL_CHANNEL.CONTACT_US);
}

async function sendConfirmationEmail(contact: IContact): Promise<void> {
  if (!contact.email) return;
  const templateKey = CATEGORY_TEMPLATE_KEY[contact.category] || EMAIL_TEMPLATE_KEYS.CONTACT_CONFIRM_OTHER;
  const rendered = await renderEmailTemplate(templateKey, {
    name: contact.name,
    reference_id: contact.reference_id,
    category: contact.category,
    message: contact.message,
  });
  if (!rendered) {
    logErrorLocation(
      "contactService.ts",
      "sendConfirmationEmail",
      new Error("Template not found"),
      `No email template configured for key '${templateKey}'`,
      "",
      { referenceId: contact.reference_id }
    );
    return;
  }
  await sendEmail(contact.email, rendered.subject, rendered.html, EMAIL_CHANNEL.CONTACT_US);
}

/**
 * Submits a Contact Us request. Works for both guests and logged-in visitors
 * — when `ctx.userSub` is set, name/email are trusted from the account
 * (never from the request body, so a logged-in visitor can't spoof another
 * identity), and a confirmation email is always attempted. A guest's email is
 * optional; they only get a confirmation if they provided one.
 */
export async function submitContact(
  input: ISubmitContactInput,
  ctx: ISubmitContactContext
): Promise<{ reference_id: string }> {
  try {
    // Honeypot: a real visitor never fills this hidden field. Fail "silently
    // successful" — a fabricated reference ID, no write, no email — so a bot
    // never learns its submission was rejected.
    if (input.website) {
      return { reference_id: buildReferenceId(`${TABLE_PK_MAPPER.Contact}${ulid()}`) };
    }

    if (await isRateLimited(ctx.ip)) {
      throw new Error("RATE_LIMITED");
    }

    let name = input.name?.trim();
    let email = input.email?.trim() || undefined;
    if (ctx.userSub) {
      const profile = await getUserProfile(ctx.userSub).catch(() => null);
      email = profile?.email || (await getCognitoUserEmail(ctx.userSub).catch(() => undefined));
      name = profile ? `${profile.given_name || ""} ${profile.family_name || ""}`.trim() || name : name;
    }
    if (!name) throw new Error("NAME_REQUIRED");
    if (!input.message?.trim()) throw new Error("MESSAGE_REQUIRED");

    const pk = TABLE_PK_MAPPER.Contact;
    const sk = `${pk}${ulid()}`;

    const contact: IContact = {
      pk,
      sk,
      type: CONTACT_ITEM_TYPE.SUBMISSION,
      reference_id: buildReferenceId(sk),
      category: input.category,
      name,
      email,
      user_sub: ctx.userSub,
      message: input.message.trim(),
      page_url: input.page_url,
      official_source_url: input.official_source_url,
      suggested_correction: input.suggested_correction,
      broken_link_url: input.broken_link_url,
      company_name: input.company_name,
      company_website: input.company_website,
      status: CONTACT_STATUS.NEW,
      priority: CONTACT_PRIORITY.MEDIUM,
      submitter_ip: ctx.ip,
    };
    await insertDataDynamoDB(ALL_TABLE_NAMES.Contact, contact);

    try {
      await sendInternalNotification(contact);
    } catch (err) {
      logErrorLocation("contactService.ts", "submitContact:internalNotify", err, "Failed to send internal contact notification", "", { sk });
    }
    try {
      await sendConfirmationEmail(contact);
    } catch (err) {
      logErrorLocation("contactService.ts", "submitContact:confirmEmail", err, "Failed to send contact confirmation email", "", { sk });
    }

    return { reference_id: contact.reference_id };
  } catch (error) {
    logErrorLocation("contactService.ts", "submitContact", error, "Error submitting contact request", "", { input, ctx });
    throw error;
  }
}
