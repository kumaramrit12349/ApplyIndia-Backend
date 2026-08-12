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
              <img src="data:image/png;base64,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" alt="Apply India" width="56" height="56"
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
                      <svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path fill="#ffffff" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://t.me/applyindia_online" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#229ED9; border-radius:8px; text-align:center;">
                      <svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path fill="#ffffff" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://whatsapp.com/channel/0029Vb7u8oNCXC3M57Orxa3I" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#25D366; border-radius:8px; text-align:center;">
                      <svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path fill="#ffffff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://www.youtube.com/@ApplyIndia-online" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#FF0000; border-radius:8px; text-align:center;">
                      <svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path fill="#ffffff" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://www.instagram.com/applyindia.online/" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#E1306C; border-radius:8px; text-align:center;">
                      <svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path fill="#ffffff" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://x.com/ApplyIndia_" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#000000; border-radius:8px; text-align:center;">
                      <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path fill="#ffffff" d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://www.linkedin.com/company/110909325/" target="_blank" class="social-btn"
                      style="display:inline-block; width:32px; height:32px; line-height:32px; background:#0A66C2; border-radius:8px; text-align:center;">
                      <span style="font-family:Arial,sans-serif; font-weight:bold; font-size:15px; color:#ffffff; line-height:32px;">in</span>
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
