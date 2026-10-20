/**
 * Share links for a lesson (stack page redesign: Post to your class, Send
 * this lesson). A link is 32 random bytes; only its hash is stored, so a
 * database read never hands out a working link. Revoking one ends it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import { plannerComplete, type PlannerAccess } from './planner-completion.server';
import {
  fallbackLessonText,
  REWRITE_SYSTEM,
  type ShareAudience,
  type ShareItem,
} from './lesson-share';

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createShareLink({
  conversationId,
  audience,
  includes,
  note = null,
  body = null,
}: {
  conversationId: string;
  audience: ShareAudience;
  includes: ShareItem[];
  note?: string | null;
  body?: string | null;
}): Promise<{ id: string; token: string }> {
  const token = newShareToken();
  const link = await prisma.lessonShareLink.create({
    data: { conversationId, audience, includes, note, body, tokenHash: hashShareToken(token) },
    select: { id: true },
  });
  return { id: link.id, token };
}

/** The link's lesson, or null when the token is unknown, revoked or expired. */
export async function findShareLink(token: string) {
  if (!/^[\w-]{20,80}$/.test(token)) return null;
  const link = await prisma.lessonShareLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
    select: {
      id: true,
      audience: true,
      includes: true,
      note: true,
      body: true,
      revokedAt: true,
      expiresAt: true,
      conversation: { select: { id: true, deletedAt: true } },
    },
  });
  if (!link || link.revokedAt || link.conversation.deletedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}

export async function revokeShareLinks(conversationId: string, audience?: ShareAudience) {
  await prisma.lessonShareLink.updateMany({
    where: { conversationId, revokedAt: null, ...(audience ? { audience } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** "We rewrite it for whoever is reading": one call, or the timed steps. */
export async function rewriteForAudience({
  request,
  access,
  audience,
  title,
  className,
  steps,
}: {
  request: Request;
  access: PlannerAccess;
  audience: ShareAudience;
  title: string;
  className: string | null;
  steps: Array<{ title: string; minutes: number; startsAt: number; excerpt: string; content: string }>;
}): Promise<string> {
  const fallback = fallbackLessonText(steps);
  try {
    const written = await plannerComplete({
      request,
      access,
      system: REWRITE_SYSTEM[audience],
      user: [
        `Lesson: ${title}${className ? ` (${className})` : ''}`,
        '',
        ...steps.map(
          (step) => `- Minute ${step.startsAt}, ${step.minutes} min: ${step.title}\n  ${step.content.replace(/\s+/g, ' ').slice(0, 700)}`
        ),
      ].join('\n'),
      feature: `lesson-planner-share-${audience}`,
      route: 'routes/api.domain.lesson-planner.stack',
      maxTokens: 1_200,
    });
    return written.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function emailLessonLink({
  to,
  subject,
  link,
  note,
  teacherName,
}: {
  to: string;
  subject: string;
  link: string;
  note: string | null;
  teacherName: string | null;
}) {
  const from = teacherName ? `${teacherName} sent you a lesson on Yawp!.` : 'A teacher sent you a lesson on Yawp!.';
  const text = [from, note ? `\n${note}\n` : '', `Open it here: ${link}`, '', 'No Yawp! login needed.'].join('\n');
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
  const html = [
    `<p>${escape(from)}</p>`,
    note ? `<p style="padding:12px;background:#F6F1EA;border-radius:8px">${escape(note).replace(/\n/g, '<br>')}</p>` : '',
    `<p><a href="${escape(link)}">Open the lesson</a></p>`,
    '<p style="color:#6E665C">No Yawp! login needed.</p>',
  ].join('');
  return sendEmail({ to, subject, text, html });
}
