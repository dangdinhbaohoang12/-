import type { AppNotification } from '../types/domain';

export function getUserNotifications(
  notifications: AppNotification[],
  userId: string,
): AppNotification[] {
  return notifications
    .filter((notification) => notification.recipientUserId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countUnreadNotifications(notifications: AppNotification[]): number {
  return notifications.filter((notification) => !notification.readAt).length;
}
