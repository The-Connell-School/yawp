/**
 * Small pure helpers for the Faculty Lounge's "Letter" look: initials and a
 * stable color for each person's avatar, and the one preview line under a
 * post in the feed.
 */
import { plainTextWithMentions } from './mentions';

/** Muted tones that hold white initials at 4.5:1 or better. */
export const LOUNGE_AVATAR_TONES = ['#B4532F', '#4F6B7A', '#6E6346', '#69507A', '#4C6A4A', '#7A4F5A'] as const;

export type LoungeAvatarTone = (typeof LOUNGE_AVATAR_TONES)[number];

export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

/** The same user id always maps to the same tone. */
export function avatarToneFor(userId: string): LoungeAvatarTone {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return LOUNGE_AVATAR_TONES[Math.abs(hash) % LOUNGE_AVATAR_TONES.length];
}

export const LOUNGE_PREVIEW_MAX = 160;

/**
 * One line under a feed row: the YAWP! team's first answer if there is one
 * (so a question that is all title shows Brian's answer), else the post's
 * own body, else nothing.
 */
export function previewFor({
  body,
  staffReplyBody,
}: {
  body: string;
  staffReplyBody: string | null;
}): string | null {
  const source = [staffReplyBody, body].find((text) => text && text.trim()) ?? null;
  if (!source) return null;
  const line = plainTextWithMentions(source).replace(/\s+/g, ' ').trim();
  if (line.length <= LOUNGE_PREVIEW_MAX) return line;
  const cut = line.slice(0, LOUNGE_PREVIEW_MAX - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.-]+$/, '');
  return `${atWord || cut}…`;
}
