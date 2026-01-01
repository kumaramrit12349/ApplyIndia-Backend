export interface Notification {
  id: string;
  title: string;
}

export interface NotificationRow {
  slug: string;
  title: string;
}

export interface NotificationListResponse {
  data: Array<{ title: string; slug: string }>;
  total: number;
  page: number;
  hasMore: boolean;
  lastEvaluatedKey;
}
