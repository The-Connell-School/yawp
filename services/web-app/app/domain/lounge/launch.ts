/**
 * The Faculty Lounge as Brian wrote it for launch (Seeding the Faculty
 * Lounge, Oct 16 2026): its name, the team's name, and the house rules every
 * teacher agrees to on their first visit.
 */
export const LOUNGE_NAME = 'Faculty Lounge';
export const LOUNGE_TEAM_NAME = 'YAWP! team';

export const LOUNGE_WELCOME_INTRO =
  'Welcome to the Faculty Lounge, a place where we ask questions, share ideas, and connect with each other. To keep this the good kind of faculty lounge, we follow a few House Rules:';

export const LOUNGE_HOUSE_RULES = [
  { title: 'Protect your students.', detail: 'No names, photos, or details that could identify a student.' },
  { title: 'Ask the question.', detail: 'No question is too basic, and we’re all here for each other.' },
  { title: 'Think out loud.', detail: 'Share what worked, what flopped, and what you’re still figuring out.' },
  { title: 'Give each other grace.', detail: 'Every classroom is different. Consider where others are coming from.' },
  { title: 'Vent if you need to, but lean toward solutions.', detail: 'Don’t just dump and run.' },
  { title: 'Keep it about teaching.', detail: 'No selling, no promotions.' },
  { title: 'Something broken or wrong?', detail: 'Use the Contact Us button to reach the YAWP! Team directly.' },
] as const;

export const LOUNGE_RULES_CONSENT_LABEL = 'I agree to follow the Lounge’s House Rules.';
export const LOUNGE_SHARE_CONSENT_LABEL =
  'YAWP! may share my posts, with my name removed, to show other educators how teachers are using YAWP!';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type LoungeSchedule = { draft: boolean; publishAt: Date | null };

/** The YAWP! team's choice when posting: now, as a draft, or at a set time. */
export function parseLoungeSchedule(input: Record<string, unknown>, now: Date): Result<LoungeSchedule> {
  const mode = typeof input.publishMode === 'string' ? input.publishMode : 'now';
  if (mode === 'draft') return { ok: true, value: { draft: true, publishAt: null } };
  if (mode !== 'schedule') return { ok: true, value: { draft: false, publishAt: null } };
  const raw = typeof input.publishAt === 'string' ? input.publishAt.trim() : '';
  const when = raw ? new Date(raw) : null;
  if (!when || Number.isNaN(when.getTime())) return { ok: false, error: 'Pick a date and time to post it.' };
  if (when.getTime() <= now.getTime()) return { ok: false, error: 'Pick a time in the future, or post it now.' };
  return { ok: true, value: { draft: false, publishAt: when } };
}

export const LOUNGE_CONTACT_MAX = 4000;

export function parseContactMessage(
  input: Record<string, unknown>
): Result<{ message: string; pageUrl: string | null }> {
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) return { ok: false, error: 'Tell us what’s going on.' };
  if (message.length > LOUNGE_CONTACT_MAX) return { ok: false, error: 'Keep it under 4,000 characters.' };
  const page = typeof input.pageUrl === 'string' ? input.pageUrl.trim() : '';
  return { ok: true, value: { message, pageUrl: /^\/app\/[\w\-/?=&.%]*$/.test(page) ? page : null } };
}

/** Bracketed notes like "[one assignment you love]" that are not markdown links. */
export function hasPlaceholderText(body: string): boolean {
  return /\[[^\]\n]{3,}\](?!\()/.test(body);
}
