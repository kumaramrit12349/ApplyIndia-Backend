import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { insertDataDynamoDB } from "../../Interpreter/dynamoDB/insertCalls";
import { updateDynamoDB } from "../../Interpreter/dynamoDB/updateCalls";
import { deleteDynamoDB } from "../../Interpreter/dynamoDB/deleteCalls";
import { ALL_TABLE_NAMES, TABLE_PK_MAPPER } from "../../db_schema/shared/SharedConstant";
import { IEmailTemplate } from "../../db_schema/EmailTemplate/EmailTemplateInterface";
import { COGNITO_CONFIG } from "../../config/env";
import { logErrorLocation } from "../../utils/errorUtils";

/**
 * Fetch all email templates.
 */
export async function getAllEmailTemplates(): Promise<IEmailTemplate[]> {
  return fetchDynamoDB<IEmailTemplate>(ALL_TABLE_NAMES.EmailTemplate, undefined, ["*"]);
}

/**
 * Fetch a single template by its fixed key (see EMAIL_TEMPLATE_KEYS).
 */
export async function getEmailTemplate(key: string): Promise<IEmailTemplate | null> {
  const templates = await fetchDynamoDB<IEmailTemplate>(ALL_TABLE_NAMES.EmailTemplate, `EmailTemplate#${key}`, ["*"]);
  return templates && templates.length > 0 ? templates[0] : null;
}

/**
 * Creates a new email template. Throws if `data.key` is already taken —
 * keys are the fixed identifiers the codebase looks templates up by (see
 * EMAIL_TEMPLATE_KEYS), so duplicates would silently shadow each other.
 */
export async function createEmailTemplate(
  data: Omit<IEmailTemplate, "pk" | "sk" | "created_at" | "modified_at">
): Promise<boolean> {
  const cleanKey = data.key.trim().toLowerCase();

  const existing = await fetchDynamoDB<IEmailTemplate>(ALL_TABLE_NAMES.EmailTemplate, `EmailTemplate#${cleanKey}`, ["sk"]);
  if (existing && existing.length > 0) {
    throw new Error(`Conflict: An email template with key '${cleanKey}' already exists.`);
  }

  const now = Date.now();
  const dbItem: IEmailTemplate = {
    ...data,
    key: cleanKey,
    pk: TABLE_PK_MAPPER.EmailTemplate,
    sk: `EmailTemplate#${cleanKey}`,
    created_at: now,
    modified_at: now,
  };

  await insertDataDynamoDB(ALL_TABLE_NAMES.EmailTemplate, dbItem);
  return true;
}

/**
 * Updates a template's content (subject/body/description) by key. The
 * identity fields (pk/sk/key/created_at) are stripped even if passed in —
 * this endpoint can only ever change content, never the record's identity.
 */
export async function updateEmailTemplate(
  key: string,
  updates: Partial<Omit<IEmailTemplate, "pk" | "sk" | "key" | "created_at">>
): Promise<boolean> {
  if (Object.keys(updates).length === 0) return true;

  // Ensure pk/sk/key/created_at can never be modified via this path — those are identity, not content.
  const { pk, sk, key: _key, created_at, modified_at, ...attributesToUpdate } = updates as any;
  if (Object.keys(attributesToUpdate).length === 0) return true;

  await updateDynamoDB(TABLE_PK_MAPPER.EmailTemplate, `EmailTemplate#${key}`, attributesToUpdate);
  return true;
}

/**
 * Permanently deletes a template by key. Any code that looks this key up
 * (e.g. the notification-approved fan-out) will start failing that channel
 * until a replacement template with the same key is created.
 */
export async function deleteEmailTemplate(key: string): Promise<boolean> {
  await deleteDynamoDB(TABLE_PK_MAPPER.EmailTemplate, `EmailTemplate#${key}`);
  return true;
}

/* ──────────────── Rendering ──────────────── */

// Shared across every email communication — kept in code, not per-template,
// so branding stays consistent without needing to duplicate it into every
// template an admin creates. Extracted from a full HTML mockup (mobile-
// responsive card layout, gradient header, OTP-style body slot, social
// links + branded footer) — header/footer below are everything outside the
// "email-body" cell; the per-template `body` from DynamoDB is injected
// between them, exactly where that mockup's own body content sat.
const EMAIL_HEADER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ApplyIndia</title>
  <style>
    /* ── Reset ── */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }

    /* ── Mobile ── */
    @media screen and (max-width: 525px) {
      .email-wrapper { width: 100% !important; padding: 10px !important; }
      .email-card   { width: 100% !important; border-radius: 0 !important; }
      .email-body   { padding: 24px 18px !important; }
      .social-table { width: 100% !important; }
      .social-btn   { font-size: 10px !important; padding: 6px 9px !important; margin-bottom: 6px !important; display: inline-block !important; }
      .footer-text  { font-size: 11px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#f4f6fb; font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" class="email-wrapper" width="100%" cellpadding="0" cellspacing="0"
    style="background:#f4f6fb; padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="email-card" cellpadding="0" cellspacing="0"
          style="width:100%; max-width:520px; background:#ffffff; border-radius:14px;
                 overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.09);">

          <!-- ── HEADER ── -->
          <tr>
            <td align="center"
              style="background:linear-gradient(135deg,#2b2a6e 0%,#6a5acd 100%); padding:28px 24px;">
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700;
                         letter-spacing:1px; font-family:Arial,sans-serif;">
                ApplyIndia
              </h1>
            </td>
          </tr>

          <!-- ── BODY (per-template content injected here) ── -->
          <tr>
            <td class="email-body"
              style="padding:32px 28px; color:#333333; font-size:15px; line-height:1.75;
                     font-family:Arial,sans-serif;">
`;

const EMAIL_FOOTER_HTML = `
            </td>
          </tr>

          <!-- ── DIVIDER ── -->
          <tr>
            <td style="padding:0 28px;">
              <hr style="border:none; border-top:1px solid #eeeeee; margin:0;" />
            </td>
          </tr>

          <!-- ── SOCIAL LINKS ── -->
          <tr>
            <td align="center" style="padding:22px 20px 18px;">
              <p style="margin:0 0 14px; font-size:11px; color:#999999; letter-spacing:1px;
                        text-transform:uppercase; font-family:Arial,sans-serif;">
                Stay connected with us
              </p>
              <table role="presentation" class="social-table" cellpadding="0" cellspacing="0"
                align="center" style="margin-bottom:8px;">
                <tr>
                  <td style="padding:0 4px;"><a href="https://www.facebook.com/profile.php?id=61585944620623" target="_blank" class="social-btn" style="display:inline-block; background:#1877F2; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">Facebook</a></td>
                  <td style="padding:0 4px;"><a href="https://t.me/applyindia_online" target="_blank" class="social-btn" style="display:inline-block; background:#229ED9; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">Telegram</a></td>
                  <td style="padding:0 4px;"><a href="https://whatsapp.com/channel/0029Vb7u8oNCXC3M57Orxa3I" target="_blank" class="social-btn" style="display:inline-block; background:#25D366; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">WhatsApp</a></td>
                  <td style="padding:0 4px;"><a href="https://www.youtube.com/@ApplyIndia-online" target="_blank" class="social-btn" style="display:inline-block; background:#FF0000; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">YouTube</a></td>
                </tr>
              </table>
              <table role="presentation" class="social-table" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="padding:0 4px;"><a href="https://www.instagram.com/applyindia.online/" target="_blank" class="social-btn" style="display:inline-block; background:#E1306C; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">Instagram</a></td>
                  <td style="padding:0 4px;"><a href="https://x.com/ApplyIndia_" target="_blank" class="social-btn" style="display:inline-block; background:#111111; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">X (Twitter)</a></td>
                  <td style="padding:0 4px;"><a href="https://www.linkedin.com/company/110909325/" target="_blank" class="social-btn" style="display:inline-block; background:#0A66C2; color:#ffffff; text-decoration:none; font-size:11px; font-weight:bold; padding:7px 13px; border-radius:5px; font-family:Arial,sans-serif;">LinkedIn</a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td align="center" class="footer-text"
              style="background:#2b2a6e; padding:18px 20px;
                     font-size:12px; line-height:1.8; font-family:Arial,sans-serif;">
              <span style="color:#9b97c4;">&copy; ${new Date().getFullYear()} ApplyIndia &nbsp;|&nbsp;</span>
              <a href="${COGNITO_CONFIG.frontendUrl}" target="_blank" style="color:#a599ff; text-decoration:none;">applyindia.online</a>
              <br/>
              <span style="font-size:11px; color:#6e6a9e;">
                You're receiving this because you subscribed to notifications on ApplyIndia. &nbsp;
                <a href="${COGNITO_CONFIG.frontendUrl}/notification-preferences" style="color:#a599ff; text-decoration:none;">Manage preferences</a>
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/** Replaces every `{{key}}` occurrence in `template` with `variables[key]` (blank if the key is unknown). */
function substitutePlaceholders(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => variables[key] ?? "");
}

/**
 * Fetches a template by key, substitutes {{variable}} placeholders in its
 * subject/body, and wraps the body with the shared header/footer. Returns
 * null (never throws) if the template doesn't exist — there is no hardcoded
 * fallback content; callers must treat a null result as "this channel can't
 * be sent" (e.g. mark it failed) rather than sending placeholder copy.
 */
export async function renderEmailTemplate(
  templateKey: string,
  variables: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  try {
    const template = await getEmailTemplate(templateKey);
    if (!template) {
      logErrorLocation("emailTemplateService.ts", "renderEmailTemplate", new Error("Template not found"), "", "", { templateKey });
      return null;
    }
    return {
      subject: substitutePlaceholders(template.subject, variables),
      html: EMAIL_HEADER_HTML + substitutePlaceholders(template.body, variables) + EMAIL_FOOTER_HTML,
    };
  } catch (error) {
    logErrorLocation("emailTemplateService.ts", "renderEmailTemplate", error, "Failed to render email template", "", { templateKey });
    return null;
  }
}
