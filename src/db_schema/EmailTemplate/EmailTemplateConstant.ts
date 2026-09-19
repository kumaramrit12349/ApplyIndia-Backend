export const EMAIL_TEMPLATE = {
  pk: "pk",
  sk: "sk",
  key: "key",
  subject: "subject",
  body: "body",
  description: "description",
  created_at: "created_at",
  modified_at: "modified_at",
};

// Fixed keys the codebase looks up templates by — add one per email "type"
// as new emails are introduced.
export const EMAIL_TEMPLATE_KEYS = {
  NOTIFICATION_APPROVED: "notification-approved",
  GUIDANCE_BOOKING_CONFIRMED: "guidance-booking-confirmed",
  GUIDANCE_SLOT_CANCELLED: "guidance-slot-cancelled",
  CONTACT_CONFIRM_REPORT_ERROR: "contact-confirm-report-error",
  CONTACT_CONFIRM_SUGGEST_UPDATE: "contact-confirm-suggest-update",
  CONTACT_CONFIRM_BROKEN_LINK: "contact-confirm-broken-link",
  CONTACT_CONFIRM_GENERAL_QUERY: "contact-confirm-general-query",
  CONTACT_CONFIRM_BUSINESS_ENQUIRY: "contact-confirm-business-enquiry",
  CONTACT_CONFIRM_FEEDBACK: "contact-confirm-feedback",
  CONTACT_CONFIRM_OTHER: "contact-confirm-other",
  CONTACT_REPLY: "contact-reply",
  CONTACT_ADMIN_NOTIFY: "contact-admin-notify",
} as const;
