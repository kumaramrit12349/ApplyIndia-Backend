export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  createdAt: Date;
}

export interface NotificationRow {
  id: number;
  title: string;
}

export interface NotificationListResponse {
  data: Array<{ name: string; notification_id: string }>;
  total: number;
  page: number;
  hasMore: boolean;
}
