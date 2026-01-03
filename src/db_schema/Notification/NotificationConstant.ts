export const NOTIFICATION = {
  /* keys */
  pk: "pk",
  sk: "sk",
  type: "type",

  /* meta */
  title: "title",
  category: "category",
  department: "department",
  total_vacancies: "total_vacancies",

  has_admit_card: "has_admit_card",
  has_result: "has_result",
  has_answer_key: "has_answer_key",
  has_syllabus: "has_syllabus",

  start_date: "start_date",
  last_date_to_apply: "last_date_to_apply",
  exam_date: "exam_date",
  admit_card_date: "admit_card_date",
  result_date: "result_date",

  created_at: "created_at",
  modified_at: "modified_at",
  approved_at: "approved_at",
  approved_by: "approved_by",
  is_archived: "is_archived",

  details: {
    short_description: "short_description",
    long_description: "long_description",
    important_date_details: "important_date_details",
  },

  fee: {
    general_fee: "general_fee",
    obc_fee: "obc_fee",
    sc_fee: "sc_fee",
    st_fee: "st_fee",
    ph_fee: "ph_fee",
    other_fee_details: "other_fee_details",
  },

  eligibility: {
    min_age: "min_age",
    max_age: "max_age",
    qualification: "qualification",
    specialization: "specialization",
    min_percentage: "min_percentage",
    age_relaxation_details: "age_relaxation_details",
    qualification_details: "qualification_details",
  },

  links: {
    youtube_link: "youtube_link",
    apply_online_url: "apply_online_url",
    notification_pdf_url: "notification_pdf_url",
    official_website_url: "official_website_url",
    admit_card_url: "admit_card_url",
    answer_key_url: "answer_key_url",
    result_url: "result_url",
    other_links: "other_links",
  },
} as const;

export const DETAIL_VIEW_NOTIFICATION = [
  NOTIFICATION.title,
  NOTIFICATION.category,
  NOTIFICATION.department,
  NOTIFICATION.total_vacancies,
  NOTIFICATION.type,
  NOTIFICATION.is_archived,

  NOTIFICATION.details.short_description,
  NOTIFICATION.details.long_description,

  NOTIFICATION.has_syllabus,
  NOTIFICATION.has_admit_card,
  NOTIFICATION.has_result,
  NOTIFICATION.has_answer_key,

  NOTIFICATION.start_date,
  NOTIFICATION.last_date_to_apply,
  NOTIFICATION.exam_date,
  NOTIFICATION.admit_card_date,
  NOTIFICATION.result_date,
  NOTIFICATION.details.important_date_details,

  NOTIFICATION.fee.general_fee,
  NOTIFICATION.fee.obc_fee,
  NOTIFICATION.fee.sc_fee,
  NOTIFICATION.fee.st_fee,
  NOTIFICATION.fee.ph_fee,
  NOTIFICATION.fee.other_fee_details,

  NOTIFICATION.eligibility.min_age,
  NOTIFICATION.eligibility.max_age,
  NOTIFICATION.eligibility.age_relaxation_details,

  NOTIFICATION.eligibility.qualification,
  NOTIFICATION.eligibility.specialization,
  NOTIFICATION.eligibility.min_percentage,
  NOTIFICATION.eligibility.qualification_details,

  NOTIFICATION.links.youtube_link,
  NOTIFICATION.links.apply_online_url,
  NOTIFICATION.links.notification_pdf_url,
  NOTIFICATION.links.official_website_url,
  NOTIFICATION.links.admit_card_url,
  NOTIFICATION.links.answer_key_url,
  NOTIFICATION.links.result_url,
  NOTIFICATION.links.other_links,

  NOTIFICATION.created_at,
  NOTIFICATION.modified_at,
  NOTIFICATION.approved_at,
  NOTIFICATION.approved_by,
];

export const HOME_PAGE_NOTIFICATION = [
  NOTIFICATION.title,
  NOTIFICATION.category,
  NOTIFICATION.approved_at,
  NOTIFICATION.start_date,
  NOTIFICATION.last_date_to_apply,
  NOTIFICATION.has_syllabus,
  NOTIFICATION.has_admit_card,
  NOTIFICATION.has_answer_key,
  NOTIFICATION.has_result,
  NOTIFICATION.created_at,
];

export enum NOTIFICATION_TYPE {
  META = "META",
  DETAILS = "DETAILS",
  FEE = "FEE",
  ELIGIBILITY = "ELIGIBILITY",
  LINKS = "LINKS",
}
