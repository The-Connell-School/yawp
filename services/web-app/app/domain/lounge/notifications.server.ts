/**
 * Emails for Teacher's Lounge activity. Sending never blocks or fails the
 * request that caused it: callers fire and forget, and every failure is
 * logged and swallowed.
 *
 * Questions for the Yawp team go to LOUNGE_STAFF_NOTIFY_EMAILS (comma
 * separated). When it is unset they still wait in the admin inbox.
 */
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import type { LoungeNotification } from './lounge.server';
import { buildLoungeEmail, staffNotifyEmails } from './notifications';

export async function sendLoungeNotifications(
  notifications: LoungeNotification[],
  origin: string
): Promise<void> {
  if (notifications.length === 0) return;
  try {
    const userIds = notifications.flatMap((n) => ('toUserId' in n ? [n.toUserId] : []));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, loungeProfile: { select: { emailNotifications: true } } },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    const now = new Date();

    for (const notification of notifications) {
      const recipients =
        notification.kind === 'staff-request'
          ? staffNotifyEmails(process.env.LOUNGE_STAFF_NOTIFY_EMAILS)
          : (() => {
              const user = byId.get(notification.toUserId);
              if (!user?.email) return [];
              if (user.loungeProfile && !user.loungeProfile.emailNotifications) return [];
              return [user.email];
            })();
      if (recipients.length === 0) continue;
      const email = buildLoungeEmail(notification, origin);
      for (const to of recipients) {
        await sendEmail({ to, subject: email.subject, text: email.text, html: email.html });
      }
      if (notification.kind === 'mention') {
        await prisma.loungeMention.updateMany({
          where: { postId: notification.postId, mentionedUserId: notification.toUserId, notifiedAt: null },
          data: { notifiedAt: now },
        });
      }
    }
  } catch (error) {
    console.error('lounge_notification_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
