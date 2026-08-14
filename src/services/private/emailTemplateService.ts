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
  <title>Apply India</title>
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
      .social-btn   { width: 28px !important; height: 28px !important; line-height: 28px !important; }
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
            <td align="center" style="background:#1a2744; padding:26px 24px 20px;">
              <img src="https://applyindia.online/apple-touch-icon.png" alt="Apply India" width="56" height="56"
                style="display:block; margin:0 auto 10px; border-radius:50%; background:#ffffff;" />
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700;
                         letter-spacing:1px; font-family:Arial,sans-serif;">
                Apply <span style="color:#ff6b00;">India</span>
              </h1>
            </td>
          </tr>

          <!-- ── TRICOLOR ACCENT ── -->
          <tr>
            <td style="height:4px; line-height:4px; font-size:0;
              background:linear-gradient(90deg,#ff9933 0%,#ff9933 33%,#ffffff 33%,#ffffff 66%,#138808 66%,#138808 100%);">
              &nbsp;
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
          <!-- Real hosted PNGs (icons8.com — same URLs the site's own footer
               uses), not inline SVG/base64: those get stripped by Gmail and
               most other email clients, which is why this row was broken
               before. LinkedIn intentionally omitted. -->
          <tr>
            <td align="center" style="padding:22px 20px 18px;">
              <p style="margin:0 0 14px; font-size:11px; color:#999999; letter-spacing:1px;
                        text-transform:uppercase; font-family:Arial,sans-serif;">
                Stay connected with us
              </p>
              <table role="presentation" class="social-table" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="padding:0 5px;">
                    <a href="https://www.facebook.com/profile.php?id=61585944620623" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#1877F2; border-radius:8px; text-align:center;">
                      <img src="https://img.icons8.com/ios-filled/24/ffffff/facebook-new.png" alt="Facebook" width="16" height="16" style="vertical-align:middle;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://t.me/applyindia_online" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#229ED9; border-radius:8px; text-align:center;">
                      <img src="https://img.icons8.com/ios-filled/24/ffffff/telegram-app.png" alt="Telegram" width="16" height="16" style="vertical-align:middle;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://whatsapp.com/channel/0029Vb7u8oNCXC3M57Orxa3I" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#25D366; border-radius:8px; text-align:center;">
                      <img src="https://img.icons8.com/ios-filled/24/ffffff/whatsapp.png" alt="WhatsApp" width="16" height="16" style="vertical-align:middle;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://www.youtube.com/@ApplyIndia-online" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#FF0000; border-radius:8px; text-align:center;">
                      <img src="https://img.icons8.com/ios-filled/24/ffffff/youtube-play.png" alt="YouTube" width="16" height="16" style="vertical-align:middle;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://www.instagram.com/applyindia.online/" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#E1306C; border-radius:8px; text-align:center;">
                      <img src="https://img.icons8.com/ios-filled/24/ffffff/instagram-new.png" alt="Instagram" width="16" height="16" style="vertical-align:middle;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://x.com/ApplyIndia_" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#000000; border-radius:8px; text-align:center;">
                      <img src="https://img.icons8.com/ios-filled/24/ffffff/twitter.png" alt="X" width="16" height="16" style="vertical-align:middle;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td align="center" class="footer-text"
              style="background:#1a2744; padding:18px 20px;
                     font-size:12px; line-height:1.8; font-family:Arial,sans-serif;">
              <span style="color:#8a93ab;">&copy; ${new Date().getFullYear()} Apply India &nbsp;|&nbsp;</span>
              <a href="${COGNITO_CONFIG.frontendUrl}" target="_blank" style="color:#ffab5e; text-decoration:none;">applyindia.online</a>
              <br/>
              <span style="font-size:11px; color:#6e7791;">
                You're receiving this because you subscribed to notifications on Apply India. &nbsp;
                <a href="${COGNITO_CONFIG.frontendUrl}/notification-preferences" style="color:#ffab5e; text-decoration:none;">Manage preferences</a>
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

// Sample notification-approved body + variables, used only to build
// FULL_EMAIL_SAMPLE below (a local dev/testing aid — not used by any send
// or preview path, both of which fetch the real template from DynamoDB).
const SAMPLE_NOTIFICATION_BODY = `<p style="margin:0 0 18px;font-size:16px;">
  Hi there 👋,
</p>

<p style="margin:0 0 18px;">
  A new notification matching your interests has just been published on
  <strong style="color:#ff6b00;">Apply India</strong>. Here are the details:
</p>

<!-- Notification Details Box -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:25px 0;">
  <tr>
    <td style="
        background:#f7f8ff;
        border:2px dashed #5865f2;
        border-radius:12px;
        padding:22px 24px;">

      <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#2b2a6e;line-height:1.4;">
        {{title}}
      </p>

      <p style="margin:0 0 6px;font-size:14px;color:#333333;">
        <strong>Category:</strong> {{category}}
      </p>

      <p style="margin:0;font-size:14px;color:#333333;">
        <strong>Last Date to Apply:</strong> {{last_date_to_apply}}
      </p>

    </td>
  </tr>
</table>

<!-- CTA Button -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td align="center">
      <a href="{{url}}" target="_blank"
         style="display:inline-block;
                background:#ff6b00;
                color:#ffffff;
                text-decoration:none;
                font-weight:bold;
                font-size:15px;
                padding:14px 32px;
                border-radius:8px;
                font-family:Arial,sans-serif;">
        View Full Details &amp; Apply
      </a>
    </td>
  </tr>
</table>

<!-- Info Box -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td style="
        background:#fff8e5;
        border-left:4px solid #ffb100;
        padding:14px 16px;
        border-radius:6px;
        font-size:13px;
        color:#775300;
        line-height:1.6;">

      ⏰ <strong>Don't miss the deadline.</strong> Make sure to apply before the last date mentioned above.

    </td>
  </tr>
</table>

<p style="margin:0 0 18px;">
  You're receiving this because you subscribed to notifications on Apply India. You can update your email/WhatsApp and topic preferences anytime from your account.
</p>

<p style="margin:24px 0 0;">
  Regards,<br>
  <strong style="font-size:16px;color:#2b2a6e;">
    Team Apply India
  </strong>
</p>`;

/**
 * Sample data for previewing the notification-approved template — shared by
 * FULL_EMAIL_SAMPLE below and the GET /:key/preview route.
 */
export const PREVIEW_SAMPLE_VARIABLES: Record<string, string> = {
  title: "SSC CGL 2026 Recruitment — Combined Graduate Level Examination",
  category: "Job",
  last_date_to_apply: "31 Dec 2026",
  url: "https://applyindia.online/notification/ssc-cgl-2026/sample-id",
};

/**
 * Full sample email (header + a sample notification body + footer), always
 * in sync with EMAIL_HEADER_HTML/EMAIL_FOOTER_HTML since it's built from
 * them directly rather than a separate hardcoded copy. Not used by any send
 * path — exposed via GET /api/email-templates/sample-preview so the header/
 * footer theme can be checked without needing a real template saved in
 * DynamoDB first.
 */
export const FULL_EMAIL_SAMPLE =
  EMAIL_HEADER_HTML + substitutePlaceholders(SAMPLE_NOTIFICATION_BODY, PREVIEW_SAMPLE_VARIABLES) + EMAIL_FOOTER_HTML;

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
