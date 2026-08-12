import { NOTIFICATION_TYPE } from "./NotificationConstant";

export interface INotification {
  /* Keys */
  pk?: string;
  sk?: string;
  type?: string;

  /* Basic Info */
  title: string;
  category: string;
  state: string;
  department: string;
  total_vacancies: number;

  /* Status Flags */
  has_admit_card: boolean;
  has_result: boolean;
  has_answer_key: boolean;
  has_syllabus: boolean;

  /* Dates */
  start_date: string;
  last_date_to_apply: string;
  exam_date?: string;
  admit_card_date?: string;
  result_date?: string;

  /* Nested Sections */
  details: INotificationDetails;
  fee: INotificationFee;
  eligibility: INotificationEligibility;
  links: INotificationLinks;

  /* Admin */
  approved_by?: string;
  approved_at?: number | null;
  is_archived?: boolean;
  created_by?: string;
  created_at?: number;
  modified_at?: number;
  review_status?: 'pending' | 'changes_requested' | 'approved';
  review_comments?: IReviewComment[];
  /** When true (the default), approving this notification triggers the email fan-out to eligible users. */
  send_email_notification?: boolean;
  /** When true (the default), approving this notification triggers a Telegram channel post. */
  send_telegram_notification?: boolean;

  /* Scraper */
  source_url?: string;   // canonical URL of the scraped listing page
  scraped_from?: string; // human-readable site name, e.g. "Sarkari Result"

  /* Aggregate user activity counts (maintained by userActivityService) */
  count_wishlisted?: number;
  count_applied?: number;
  count_admit_card?: number;
  count_result?: number;
  count_selected?: number;
}

export interface INotificationDetails {
  short_description: string;
  long_description: string;
}

export interface INotificationFee {
  general_fee: number;
  obc_fee: number;
  sc_fee: number;
  st_fee: number;
  ph_fee: number;
  ews_fee: number;
  female_fee: number;
}

export interface INotificationEligibility {
  min_age: number;
  max_age: number;
  qualification: string;
  specialization: string;
  min_percentage: number;
}

export interface INotificationLinks {
  youtube_link?: string;
  apply_online_url?: string;
  notification_pdf_url?: string;
  official_website_url?: string;
  admit_card_url?: string;
  answer_key_url?: string;
  result_url?: string;
  other_links?: string;
}

export interface INotificationListItem {
  sk: string;
  title: string;
  category: string;
  state: string;
  created_at: number;
  type: string;
  approved_at: number;
  approved_by: string;
  is_archived: boolean;
  review_status?: 'pending' | 'changes_requested' | 'approved';
}

export type INotificationItem =
  | (INotification & { type: NOTIFICATION_TYPE.META })
  | { type: NOTIFICATION_TYPE.DETAILS }
  | { type: NOTIFICATION_TYPE.FEE }
  | { type: NOTIFICATION_TYPE.ELIGIBILITY }
  | { type: NOTIFICATION_TYPE.LINKS }
  | { type: NOTIFICATION_TYPE.COMMENT };

export interface IReviewComment {
  comment_id: string;
  reviewer_sub: string;
  reviewer_name: string;
  comment_text: string;
  created_at: number;
}
