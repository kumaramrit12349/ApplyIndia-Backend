export const EMAIL_TEMPLATE = {
  pk: "pk",
  sk: "sk",
  key: "key",
  subject: "subject",
  body: "body",
  description: "description",
  created_at: "created_at",
  modified_at: "modified_at",
  created_by: "created_by",
};

// Fixed keys the codebase looks up templates by — add one per email "type"
// as new emails are introduced.
export const EMAIL_TEMPLATE_KEYS = {
  NOTIFICATION_APPROVED: "notification-approved",
} as const;
