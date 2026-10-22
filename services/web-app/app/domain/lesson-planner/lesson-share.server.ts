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
  lessonEmail,
  withoutWritingShare,
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
    // The page shows the writing time from the stack; never a second one.
    return withoutWritingShare(written) || fallback;
  } catch {
    return fallback;
  }
}

/** Ids the email util returns when it logs an email instead of sending it. */
const NOT_SENT = new Set(['preview-captured', 'mocked', 'local-captured']);

/**
 * Emails the link. `sent` is false on a PR preview (and locally), where email
 * is logged and never delivered, so the page can say so instead of "Sent"
 * (Brian's run 4, item 5).
 */
export async function emailLessonLink(
  options: Parameters<typeof lessonEmail>[0] & { to: string }
): Promise<{ sent: boolean }> {
  const { subject, text, html } = lessonEmail(options);
  const result = await sendEmail({ to: options.to, subject, text, html });
  const id = result.status === 'success' ? (result.data as { id?: string } | undefined)?.id : undefined;
  return { sent: result.status === 'success' && !NOT_SENT.has(id ?? '') };
}
