export interface IEmailTemplate {
  pk?: string;
  sk?: string;
  /** Matches an EMAIL_TEMPLATE_KEYS value; sk = EmailTemplate#<key>. */
  key: string;
  /** May contain {{variable}} placeholders. */
  subject: string;
  /** HTML content; may contain {{variable}} placeholders. Shared header/footer are NOT part of this — added at send time. */
  body: string;
  /** Admin-facing note, e.g. which placeholders this template supports. */
  description?: string;
  created_at?: number;
  modified_at?: number;
  created_by?: string;
}
