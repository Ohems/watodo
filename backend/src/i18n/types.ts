export interface NotificationMessageTemplate {
  title: string;
  body: string;
}

/** The server-owned translations of one locale (served to the frontend). */
export interface LocaleBundle {
  notifications: Record<string, NotificationMessageTemplate>;
}
