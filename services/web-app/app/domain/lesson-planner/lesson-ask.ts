/**
 * The two questions a teacher answers on every lesson, asked properly.
 *
 * "How long is the period?" and "what kind of activities do you want?" are the
 * questions the planner needs almost every time, and typing the answer is the
 * worst way to give it. A length is a point on a spectrum; a set of activities
 * is a list to check. So the planner asks for a control instead of a sentence,
 * and the teacher drags and ticks.
 *
 * The answer still leaves as an ordinary chat message. Nothing new is stored
 * and no new endpoint is involved: the control composes the sentence the
 * teacher would otherwise have typed, and sends that.
 */

export const ASK_FENCE = 'yawp-ask';

/** A bell-ringer at one end, a double block at the other. */
export const LESSON_MINUTES_MIN = 5;
export const LESSON_MINUTES_MAX = 90;
/** Teachers say 45 and 50, never 47. */
export const LESSON_MINUTES_STEP = 5;
const DEFAULT_MINUTES = 50;

/**
 * The option that is always offered alongside the activities: the teacher
 * handing the choice back. Kept out of the list because it is not an activity,
 * it is the absence of a choice, and it renders on its own.
 */
export const PLANNER_PICKS_ACTIVITIES = 'planner-picks';

export type LessonActivity = {
  id: string;
  label: string;
  /** Roughly how the room is arranged, so the list can be grouped. */
  group: 'whole class' | 'small group' | 'independent';
};

/**
 * Shapes a lesson actually takes. Deliberately a short list of things an
 * English teacher would recognise by name — a longer one is a wall of
 * checkboxes nobody reads.
 */
export const LESSON_ACTIVITIES: LessonActivity[] = [
  {
    id: 'mini-lesson',
    label: 'Mini-lesson or direct instruction',
    group: 'whole class',
  },
  { id: 'modeling', label: 'Modeling / think-aloud', group: 'whole class' },
  { id: 'discussion', label: 'Whole-class discussion', group: 'whole class' },
  { id: 'debate', label: 'Debate', group: 'whole class' },
  { id: 'fishbowl', label: 'Fishbowl', group: 'whole class' },
  { id: 'gallery-walk', label: 'Gallery walk', group: 'small group' },
  { id: 'jigsaw', label: 'Jigsaw', group: 'small group' },
  { id: 'group-work', label: 'Small group work', group: 'small group' },
  {
    id: 'partner-work',
    label: 'Partner work / think-pair-share',
    group: 'small group',
  },
  { id: 'stations', label: 'Stations or rotations', group: 'small group' },
  {
    id: 'peer-review',
    label: 'Peer review / writing workshop',
    group: 'small group',
  },
  { id: 'worksheet', label: 'Worksheet or practice set', group: 'independent' },
  { id: 'quick-write', label: 'Quick write / journal', group: 'independent' },
  {
    id: 'independent-writing',
    label: 'Independent writing time',
    group: 'independent',
  },
  {
    id: 'close-reading',
    label: 'Close reading / annotation',
    group: 'independent',
  },
  { id: 'exit-ticket', label: 'Exit ticket', group: 'independent' },
];

const ACTIVITY_BY_ID = new Map(
  LESSON_ACTIVITIES.map((activity) => [activity.id, activity])
);

export type LessonAsk =
  | { kind: 'minutes'; defaultMinutes: number }
  | { kind: 'activities' };

const ASK_BLOCK = new RegExp(
  '```+' + ASK_FENCE + '[^\\n]*\\n([\\s\\S]*?)```+',
  'g'
);

/** Snap a guess onto the spectrum the teacher can actually drag to. */
function clampMinutes(raw: number): number {
  const snapped = Math.round(raw / LESSON_MINUTES_STEP) * LESSON_MINUTES_STEP;
  return Math.min(LESSON_MINUTES_MAX, Math.max(LESSON_MINUTES_MIN, snapped));
}

/**
 * Which controls a reply is asking for, and the reply without the request.
 */
export function readLessonAsks(content: string): {
  asks: LessonAsk[];
  body: string;
} {
  const asks: LessonAsk[] = [];
  const seen = new Set<string>();
  let body = content;

  for (const match of content.matchAll(ASK_BLOCK)) {
    body = body.replace(match[0], '');
    for (const line of (match[1] ?? '').split('\n')) {
      const [rawKind, rawValue] = line.split(':');
      const kind = rawKind?.trim().toLowerCase();
      if (!kind || seen.has(kind)) continue;

      if (kind === 'minutes') {
        const guess = Number.parseInt(rawValue?.trim() ?? '', 10);
        asks.push({
          kind: 'minutes',
          defaultMinutes: Number.isFinite(guess)
            ? clampMinutes(guess)
            : DEFAULT_MINUTES,
        });
        seen.add(kind);
      } else if (kind === 'activities') {
        asks.push({ kind: 'activities' });
        seen.add(kind);
      }
      // Anything else is a control we do not have. Skipping it quietly beats
      // failing the turn over a word.
    }
  }

  if (body === content) return { asks, body: content };
  return { asks, body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

export function hasLessonAsks(content: string): boolean {
  return readLessonAsks(content).asks.length > 0;
}

/**
 * Drop the length question from any turn that is not the intake batch.
 *
 * There is exactly one moment the slider belongs in: after the teacher has
 * said what they want to teach, and before the plan is written. Either side of
 * that window it is nonsense.
 *
 * Too early — on the opening reply — and tapping "Look at my classes and tell
 * me what they need work on" sends "…what they need work on. 50 minutes.": a
 * period length bolted onto a request to go read the gradebook, and a
 * commitment to fifty minutes made before a word about the subject.
 *
 * Too late — under a finished plan — and it is asking how long a period is
 * after timing every step of it. The planner has already decided; the question
 * is theatre.
 *
 * The activities question has no such window. "What kinds of activities do you
 * want?" is a fair question while the topic is open and a fair one after a
 * plan, so only the clock is held.
 */
export function asksWorthShowing(
  asks: LessonAsk[],
  {
    /** The teacher has said what they want; the opening reply has passed. */
    topicSettled,
    /** This reply handed over a lesson, so its length is already decided. */
    planAlreadyWritten = false,
  }: { topicSettled: boolean; planAlreadyWritten?: boolean }
): LessonAsk[] {
  if (topicSettled && !planAlreadyWritten) return asks;
  return asks.filter((ask) => ask.kind !== 'minutes');
}

/** Already ends in something that finishes a sentence. */
function isFinished(text: string): boolean {
  return /[.!?…:]$/.test(text);
}

/**
 * The sentence the teacher would have typed, built from what they set.
 *
 * Written in their voice, because it is sent as their message.
 *
 * The `note` is whatever they chose from the options offered alongside the
 * controls, and it leads: a teacher answering "what should this be about?" and
 * "how long is your period?" is answering one question, not two, and the
 * subject comes before its length.
 */
export function composeAskReply({
  note,
  minutes,
  activityIds,
}: {
  note?: string;
  minutes: number | null;
  activityIds: string[];
}): string {
  const parts: string[] = [];

  const chosen = note?.trim();
  if (chosen) parts.push(isFinished(chosen) ? chosen : `${chosen}.`);

  if (minutes !== null) parts.push(`${minutes} minutes.`);

  if (activityIds.includes(PLANNER_PICKS_ACTIVITIES)) {
    // Checking both this and specific activities is contradictory; deferring is
    // the clearer reading of "I don't want to choose".
    parts.push('You pick the activities that fit this lesson best.');
    return parts.join(' ');
  }

  const labels = activityIds
    .map((id) => ACTIVITY_BY_ID.get(id)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length) parts.push(`I want to use: ${labels.join(', ')}.`);

  return parts.join(' ');
}
