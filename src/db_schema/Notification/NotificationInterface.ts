export interface BaseInterface {
  created_at: string;
  modified_at: string;
}
export interface NotificationForm {
  // Basic details
  sk: string;
  title: string;
  category: string;
  department: string;
  total_vacancies: number; // or number if you normalize in state

  short_description: string; // HTML from editor
  long_description: string; // HTML from editor

  has_syllabus: boolean;
  has_admit_card: boolean;
  has_result: boolean;
  has_answer_key: boolean;

  // Important dates
  start_date: string; // ISO date string (yyyy-mm-dd)
  last_date_to_apply: string;
  exam_date?: string;
  admit_card_date?: string;
  result_date?: string;
  important_date_details?: string; // HTML from editor

  // Fees
  general_fee: number;
  obc_fee: number;
  sc_fee: number;
  st_fee: number;
  ph_fee: number;
  other_fee_details: string; // HTML from editor

  // Ages
  min_age: number;
  max_age: number;
  age_relaxation_details: string; // HTML from editor

  // Educational Qualification
  qualification: string;
  specialization: string;
  min_percentage: number;
  additional_details?: string; // HTML from editor

  // links
  youtube_link: string;
  apply_online_url: string;
  notification_pdf_url: string;
  official_website_url: string;
  admit_card_url?: string;
  answer_key_url?: string;
  result_url?: string;
  other_links?: string;

  created_at?: number;
  modified_at?: number;
}

export type NotificationListItem = {
  id: string;
  title: string;
  category: string;
  created_at: string;
  approved_at: string | null;
};

export interface INotification {
  id: string;
  title: string;
}

export interface NotificationRow {
  sk: string;
  title: string;
}

export interface NotificationListResponse {
  data: Array<{ title: string; sk: string }>;
  total: number;
  page: number;
  hasMore: boolean;
  lastEvaluatedKey;
}

interface NormalizedNotificationDTO {
  title: string;
  category: string;
  department: string;
  total_vacancies: number;

  start_date: string;
  last_date_to_apply: string;
  exam_date?: string;
  admit_card_available_date?: string;
  result_date?: string;
  important_date_details?: string;

  short_description: string;
  long_description: string;

  fee: {
    general_fee: number;
    obc_fee: number;
    sc_fee: number;
    st_fee: number;
    ph_fee: number;
    other_fee_details?: string;
  };

  eligibility: {
    min_age: number;
    max_age: number;
    qualification: string;
    specialization: string;
    min_percentage: number;
    age_relaxation_details?: string;
    additional_details?: string;
  };

  links: {
    youtube_link: string;
    apply_online_url: string;
    notification_pdf_url: string;
    official_website_url: string;
    admit_card_url?: string;
    answer_key_url?: string;
    result_url?: string;
    other_links?: string;
  };
}

export function normalizeNotificationForm(data: any) {
  return {
    title: data.title,
    category: data.category,
    department: data.department,
    total_vacancies: data.total_vacancies,

    start_date: data.start_date,
    last_date_to_apply: data.last_date_to_apply,
    exam_date: data.exam_date,
    admit_card_available_date: data.admit_card_available_date,
    result_date: data.result_date,
    important_date_details: data.important_date_details,

    short_description: data.short_description,
    long_description: data.long_description,

    admit_card_date: data.admit_card_date,

    fee: {
      general_fee: data.general_fee,
      obc_fee: data.obc_fee,
      sc_fee: data.sc_fee,
      st_fee: data.st_fee,
      ph_fee: data.ph_fee,
      other_fee_details: data.other_fee_details,
    },

    eligibility: {
      min_age: data.min_age,
      max_age: data.max_age,
      qualification: data.qualification,
      specialization: data.specialization,
      min_percentage: data.min_percentage,
      age_relaxation_details: data.age_relaxation_details,
      additional_details: data.additional_details,
    },

    links: {
      youtube_link: data.youtube_link,
      apply_online_url: data.apply_online_url,
      notification_pdf_url: data.notification_pdf_url,
      official_website_url: data.official_website_url,
      admit_card_url: data.admit_card_url,
      answer_key_url: data.answer_key_url,
      result_url: data.result_url,
      other_links: data.other_links,
    },
  };
}
