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
  rewriteInput,
  type RewriteStep,
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
  steps: RewriteStep[];
}): Promise<string> {
  const fallback = fallbackLessonText(steps);
  try {
    const written = await plannerComplete({
      request,
      access,
      system: REWRITE_SYSTEM[audience],
      // The stack's steps, names and order (Brian's round 5, item 7).
      user: rewriteInput({ title, className, steps }),
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

export type LessonEmailDelivery = 'sent' | 'preview' | 'failed';

/**
 * Emails the link and says what happened (Brian's run 4, item 5): sent;
 * preview, where email is logged and never delivered (PR previews, local);
 * or failed. The page says which, never "Sent" for an email that did not go.
 */
export async function emailLessonLink(
  options: Parameters<typeof lessonEmail>[0] & { to: string }
): Promise<{ delivery: LessonEmailDelivery }> {
  const { subject, text, html } = lessonEmail(options);
  try {
    const result = await sendEmail({ to: options.to, subject, text, html });
    if (result.status !== 'success') return { delivery: 'failed' };
    const id = (result.data as { id?: string } | undefined)?.id;
    return { delivery: NOT_SENT.has(id ?? '') ? 'preview' : 'sent' };
  } catch {
    return { delivery: 'failed' };
  }
}
