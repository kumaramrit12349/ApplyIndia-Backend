export interface BaseInterface {
  id: string;
  created_at: string;
  updated_at: string;
}
export interface NotificationForm extends BaseInterface {
  // Basic details
  title: string;
  category: string;
  department: string;
  total_vacancies: number; // or number if you normalize in state

  short_description: string; // HTML from editor
  long_description: string; // HTML from editor

  is_admit_card_published: boolean;
  is_result_published: boolean;
  is_answer_key_published: boolean;

  // Important dates
  start_date: string; // ISO date string (yyyy-mm-dd)
  last_date_to_apply: string;
  exam_date?: string;
  admit_card_available_date?: string;
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
}

export type NotificationListItem = {
  id: string;
  title: string;
  category: string;
  created_at: string;
  approved_at: string | null;
};
