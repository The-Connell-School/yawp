import type { LoungeNotification } from './lounge.server';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function staffNotifyEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

export function buildLoungeEmail(
  notification: LoungeNotification,
  origin: string
): { subject: string; text: string; html: string } {
  const title = notification.postTitle;
  let subject: string;
  let link: string;
  if (notification.kind === 'staff-request') {
    subject = notification.isPrivate
      ? `Private question for the Yawp team: "${title}"`
      : `New question for the Yawp team: "${title}"`;
    link = `${origin}/app/admin/lounge?post=${encodeURIComponent(notification.postId)}`;
  } else {
    link = `${origin}/app/lounge/${encodeURIComponent(notification.postId)}`;
    subject =
      notification.kind === 'mention'
        ? `${notification.actorName} mentioned you in "${title}"`
        : notification.actorIsStaff
          ? `${notification.actorName} answered "${title}"`
          : `${notification.actorName} replied to "${title}"`;
  }
  const lead =
    notification.kind === 'staff-request'
      ? `${notification.actorName} asked in the Teacher's Lounge:`
      : `${notification.actorName} wrote:`;
  const text = [lead, '', notification.excerpt, '', `Open it in Yawp: ${link}`].join('\n');
  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    `<blockquote style="margin:0;padding-left:12px;border-left:3px solid #D2714F;color:#3C3828">${escapeHtml(notification.excerpt)}</blockquote>`,
    `<p><a href="${escapeHtml(link)}">Open it in Yawp</a></p>`,
  ].join('\n');
  return { subject, text, html };
}
