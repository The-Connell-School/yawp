/**
 * @mentions are stored inside the plain-text body as tokens,
 * `@[Brian Connell](user:<id>)`, inserted by the mention picker. Storing the
 * id keeps a mention pointing at the right person if their name changes;
 * the label is only what was shown when it was written.
 */
const TOKEN = /@\[([^[\]()\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

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
