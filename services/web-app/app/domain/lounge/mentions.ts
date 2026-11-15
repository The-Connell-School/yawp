/**
 * @mentions are stored inside the plain-text body as tokens,
 * `@[Brian Connell](user:<id>)`, inserted by the mention picker. Storing the
 * id keeps a mention pointing at the right person if their name changes;
 * the label is only what was shown when it was written.
 */
const TOKEN = /@\[([^[\]()\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

/**
 * "@YAWP! team" is a mention of the whole team rather than one person. It
 * uses the same token with this reserved id (never a real user id), and asks
 * the team the way "Ask the YAWP! team" does.
 */
export const LOUNGE_TEAM_MENTION_ID = 'yawp-team';

export function mentionsTeam(body: string): boolean {
  for (const match of body.matchAll(TOKEN)) {
    if (match[2] === LOUNGE_TEAM_MENTION_ID) return true;
  }
  return false;
}

export type MentionPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; userId: string; label: string };

export function mentionToken(label: string, userId: string): string {
  const clean = label.replace(/[[\]()\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `@[${clean || 'someone'}](user:${userId})`;
}

/** Each mentioned user id once, in the order they first appear. */
export function mentionedUserIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(TOKEN)) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids;
}

export function splitMentions(body: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: 'text', text: body.slice(last, index) });
    parts.push({ type: 'mention', userId: match[2], label: match[1] });
    last = index + match[0].length;
  }
  if (last < body.length) parts.push({ type: 'text', text: body.slice(last) });
  return parts;
}

/** The body with each token shown as "@Name", for emails and previews. */
export function plainTextWithMentions(body: string): string {
  return body.replace(TOKEN, (_whole, label: string) => `@${label}`);
}

/**
 * The name being typed after an "@" right before the caret, if any. Allows
 * one space so "Brian Con" still matches. An "@" inside a word (an email
 * address) does not count.
 */
export function findMentionQuery(
  textBeforeCaret: string
): { query: string; start: number } | null {
  const match = /(^|\s)@([A-Za-z][\w.'-]*(?: [\w.'-]*)?)?$/.exec(textBeforeCaret);
  if (!match) return null;
  return {
    query: match[2] ?? '',
    start: match.index + match[1].length,
  };
}

export type PickedMention = { userId: string; label: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The composer shows "@Brian Connell"; the stored body needs the token. Each
 * picked mention whose "@Label" text is still intact becomes a token. Longer
 * labels go first so "@Ann Lee" is not cut short by "@Ann".
 */
export function encodeMentions(text: string, mentions: PickedMention[]): string {
  const unique = [...new Map(mentions.map((m) => [m.label, m])).values()].sort(
    (a, b) => b.label.length - a.label.length
  );
  let out = text;
  for (const mention of unique) {
    const pattern = new RegExp(`@${escapeRegExp(mention.label)}(?![\\w])`, 'g');
    out = out.replace(pattern, () => mentionToken(mention.label, mention.userId));
  }
  return out;
}

export function decodeMentions(body: string): { text: string; mentions: PickedMention[] } {
  const mentions: PickedMention[] = [];
  for (const part of splitMentions(body)) {
    if (part.type === 'mention' && !mentions.some((m) => m.userId === part.userId)) {
      mentions.push({ userId: part.userId, label: part.label });
    }
  }
  return { text: plainTextWithMentions(body), mentions };
}
