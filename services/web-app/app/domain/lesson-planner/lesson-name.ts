/**
 * What a lesson is called in the history.
 *
 * A conversation used to be named after the first sixty characters the teacher
 * typed. That makes a history unreadable: a teacher who taps the pinned
 * "Look at my classes and tell me what they need work on" gets a list where
 * every row says exactly that, and there is no way to tell yesterday's lesson
 * from last month's.
 *
 * The planner already writes a title at the top of every plan it delivers, so
 * the lesson takes its name from there instead — from what it turned out to
 * be, rather than from what was asked for.
 */
import { deriveSectionTitle } from './lesson-packet';
import { looksLikeLessonPlan } from './suggestions';

/** Long enough to identify a lesson, short enough for a sidebar row. */
const MAX_NAME_CHARS = 70;

/**
 * Titles that identify nothing.
 *
 * The planner opens plenty of plans with a generic banner. Naming a lesson
 * "Lesson Plan" is no better than naming it after the teacher's first message.
 */
const EMPTY_NAMES =
  /^(lesson\s*plan|the\s*lesson|your\s*lesson|overview|objective|summary|plan)$/i;

/** Strip a leading label the planner tends to put in front of the real name. */
const LABEL_PREFIX = /^(lesson\s*plan|lesson)\s*[:–—-]\s*/i;

/**
 * A name for this lesson, taken from a plan the planner delivered — or null
 * when the reply is not a plan, or its heading says nothing worth filing under.
 */
export function deriveLessonName(reply: string): string | null {
  if (!looksLikeLessonPlan(reply)) return null;

  // Index 0 is only the fallback name, which we reject below anyway.
  const heading = deriveSectionTitle(reply, 0).replace(LABEL_PREFIX, '').trim();
  if (!heading || EMPTY_NAMES.test(heading)) return null;
  // deriveSectionTitle falls back to "Section 1" when there is no heading and
  // no usable opening line; that is not a lesson name either.
  if (/^Section \d+$/.test(heading)) return null;

  return heading.length > MAX_NAME_CHARS
    ? `${heading.slice(0, MAX_NAME_CHARS - 1).trimEnd()}…`
    : heading;
}

/**
 * Should this reply rename the lesson?
 *
 * Only the first plan gets to name it. A teacher revising a plan five times
 * should not watch the lesson rename itself under them each round, and a name
 * they typed themselves always wins.
 */
export function shouldRenameLesson({
  reply,
  priorReplies,
  teacherNamedIt,
}: {
  reply: string;
  /** Assistant replies already in this conversation, oldest first. */
  priorReplies: string[];
  /** The teacher gave the packet a name of their own. */
  teacherNamedIt: boolean;
}): string | null {
  if (teacherNamedIt) return null;
  if (priorReplies.some((prior) => looksLikeLessonPlan(prior))) return null;
  return deriveLessonName(reply);
}

/**
 * The name a lesson gets the moment it is created: the teacher's first message,
 * whitespace collapsed, cut at 57 characters. It is a placeholder until the
 * first plan names the lesson.
 */
export function firstMessageTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed || 'New lesson';
  return `${trimmed.slice(0, 57)}…`;
}

/**
 * Whether the lesson's name is still that placeholder (Brian's review, B5), so
 * the stack screen can ask for a name instead of showing the teacher's raw
 * first message as though it were one.
 */
export function nameIsProvisional({
  title,
  packetTitle,
  firstUserMessage,
  unitDay,
}: {
  title: string;
  packetTitle: string | null;
  firstUserMessage: string | null;
  unitDay: number | null;
}): boolean {
  if (packetTitle?.trim()) return false;
  if (unitDay !== null) return false;
  if (firstUserMessage === null) return title === 'New lesson';
  return title === firstMessageTitle(firstUserMessage);
}
