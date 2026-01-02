export const NOTIFICATION = {
  sk: "sk",
  title: "title",
  category: "category",
  department: "department",
  total_vacancies: "total_vacancies",

  short_description: "short_description",
  long_description: "long_description",

  has_syllabus: "has_syllabus",
  has_admit_card: "has_admit_card",
  has_result: "has_result",
  has_answer_key: "has_answer_key",

  start_date: "start_date",
  last_date_to_apply: "last_date_to_apply",
  exam_date: "exam_date",
  admit_card_date: "admit_card_date",
  result_date: "result_date",
  important_date_details: "important_date_details",

  general_fee: "general_fee",
  obc_fee: "obc_fee",
  sc_fee: "sc_fee",
  st_fee: "st_fee",
  ph_fee: "ph_fee",
  other_fee_details: "other_fee_details",

  min_age: "min_age",
  max_age: "max_age",
  age_relaxation_details: "age_relaxation_details",

  qualification: "qualification", // Comma seperated
  specialization: "specialization", // Comman seperated
  min_percentage: "min_percentage",
  qualification_details: "qualification_details",

  youtube_link: "youtube_link",
  apply_online_url: "apply_online_url",
  notification_pdf_url: "notification_pdf_url",
  official_website_url: "official_website_url",
  admit_card_url: "admit_card_url",
  answer_key_url: "answer_key_url",
  result_url: "result_url",
  other_links: "other_links",

  slug: "slug",

  approved_by: "approved_by",
  approved_at: "approved_at",
  is_archived: "is_archived",
  created_at: "created_at",
  modified_at: "modified_at",
} as const;

export const DETAIL_NOTIFICATION_FOR_EDIT = [
  NOTIFICATION.title,
  NOTIFICATION.category,
  NOTIFICATION.department,
  NOTIFICATION.total_vacancies,

  NOTIFICATION.short_description,
  NOTIFICATION.long_description,

  NOTIFICATION.has_syllabus,
  NOTIFICATION.has_admit_card,
  NOTIFICATION.has_result,
  NOTIFICATION.has_answer_key,

  NOTIFICATION.start_date,
  NOTIFICATION.last_date_to_apply,
  NOTIFICATION.exam_date,
  NOTIFICATION.admit_card_date,
  NOTIFICATION.result_date,
  NOTIFICATION.important_date_details,

  NOTIFICATION.general_fee,
  NOTIFICATION.obc_fee,
  NOTIFICATION.sc_fee,
  NOTIFICATION.st_fee,
  NOTIFICATION.ph_fee,
  NOTIFICATION.other_fee_details,

  NOTIFICATION.min_age,
  NOTIFICATION.max_age,
  NOTIFICATION.age_relaxation_details,

  NOTIFICATION.qualification,
  NOTIFICATION.specialization,
  NOTIFICATION.min_percentage,
  NOTIFICATION.qualification_details,

  NOTIFICATION.youtube_link,
  NOTIFICATION.apply_online_url,
  NOTIFICATION.notification_pdf_url,
  NOTIFICATION.official_website_url,
  NOTIFICATION.admit_card_url,
  NOTIFICATION.answer_key_url,
  NOTIFICATION.result_url,
  NOTIFICATION.other_links,
]

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

]
