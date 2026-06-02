import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db'; 
// @ts-ignore - Assuming notifications schema is being built in another PR
import { notifications } from '@/server/db/schema';

/**
 * Marks all unread notifications as read for a specific user.
 * @param userId - The ID of the authenticated user
 * @returns The count of updated notifications
 */
export const markAllUnreadAsRead = async (userId: string): Promise<number> => {
  const result = await db.update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      )
    )
    .returning({ id: notifications.id });

  return result.length;
};