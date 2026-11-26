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
  | {
      kind: 'minutes';
      defaultMinutes: number;
      /**
       * Whether the planner actually named a length. Intake v2 never starts a
       * slider on a guess (Brian's review, A2), so it needs to know.
       */
      hinted?: boolean;
    }
  | { kind: 'activities' }
  /** Intake v2 (A1): which of the teacher's real classes, as checkboxes. */
  | { kind: 'classes' }
  /**
   * Intake v2 (A3): how to fill the time, as one single choice whose options
   * are the planner's own, written for this lesson's content.
   */
  | { kind: 'choose'; options: string[] }
  /**
   * What the lesson or unit is for (Kevin, Nov 26: "if they got one thing out
   * of this what would it be"): the planner's own candidates for this text, as
   * one choice, plus the teacher's own words.
   */
  | { kind: 'goal'; options: string[] }
  /** What students should do most: write, discuss, read closely, or a mix. */
  | { kind: 'balance' }
  /** Where a unit leads: an essay, a seminar, a project, a test, or nothing yet. */
  | { kind: 'leads' }
  /** A companion text from Yawp!'s vetted list, or none, or the planner's choice. */
  | { kind: 'companion'; options: string[] };

/** What students should do most (when the teacher doesn't say, the default arc stands). */
export const LESSON_BALANCES = [
  { id: 'writing', label: 'Writing', says: 'Lean it toward writing.' },
  { id: 'discussion', label: 'Discussion', says: 'Lean it toward discussion.' },
  { id: 'reading', label: 'Close reading', says: 'Lean it toward close reading.' },
  { id: 'mix', label: 'A mix: you decide', says: 'You decide the balance of reading, writing and discussion.' },
] as const;

/** Where a unit can lead. */
export const UNIT_ENDINGS = [
  { id: 'essay', label: 'An essay', says: 'It leads to an essay.' },
  { id: 'seminar', label: 'A Socratic seminar', says: 'It leads to a Socratic seminar.' },
  { id: 'project', label: 'A project or presentation', says: 'It leads to a project or presentation.' },
  { id: 'test', label: 'A test', says: 'It leads to a test.' },
  { id: 'open', label: 'Nothing yet', says: "It doesn't lead to anything set yet." },
] as const;

const PURPOSE_KINDS = new Set<LessonAsk['kind']>(['goal', 'balance', 'leads', 'companion']);

/** The companion answers that are not a text. */
export const NO_COMPANION = '__no-companion__';
export const PLANNER_PICKS_COMPANION = '__planner-picks-companion__';

/** Long enough for a real option, short enough to read on a radio row. */
const MAX_CHOOSE_OPTION_CHARS = 140;
const MAX_CHOOSE_OPTIONS = 5;

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
      if (kind === 'choose' || kind === 'goal' || kind === 'companion') {
        // Many lines, one question: every option joins the same ask.
        const option = line
          .slice(line.indexOf(':') + 1)
          .trim()
          .slice(0, MAX_CHOOSE_OPTION_CHARS);
        if (!option) continue;
        type Listed = Extract<LessonAsk, { kind: 'choose' | 'goal' | 'companion' }>;
        let choose: Listed | undefined = asks.find((ask): ask is Listed => ask.kind === kind);
        if (!choose) {
          const made: Listed = { kind, options: [] };
          asks.push(made);
          choose = made;
        }
        if (
          choose.options.length < MAX_CHOOSE_OPTIONS &&
          !choose.options.includes(option)
        ) {
          choose.options.push(option);
        }
        continue;
      }
      if (!kind || seen.has(kind)) continue;

      if (kind === 'minutes') {
        const guess = Number.parseInt(rawValue?.trim() ?? '', 10);
        asks.push({
          kind: 'minutes',
          defaultMinutes: Number.isFinite(guess)
            ? clampMinutes(guess)
            : DEFAULT_MINUTES,
          hinted: Number.isFinite(guess),
        });
        seen.add(kind);
      } else if (kind === 'classes') {
        asks.push({ kind: 'classes' });
        seen.add(kind);
      } else if (kind === 'activities') {
        asks.push({ kind: 'activities' });
        seen.add(kind);
      } else if (kind === 'balance' || kind === 'leads') {
        asks.push({ kind });
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
  // How to fill the time is as tied to the moment as the clock is: it needs a
  // subject, and a written plan has already answered it. Which class it is for
  // can be asked on the opening turn, but never under a plan.
  // What the work is for is asked only once its subject is named, so it may
  // come on the first reply ("Plan an 8-day unit on…", Nov 26); a written plan
  // has already answered it.
  return asks.filter(
    (ask) =>
      ask.kind !== 'minutes' &&
      ask.kind !== 'choose' &&
      !(PURPOSE_KINDS.has(ask.kind) && planAlreadyWritten) &&
      !(ask.kind === 'classes' && planAlreadyWritten)
  );
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

/**
 * The teacher's answer to the intake v2 card (Brian's review, A1–A3), in their
 * voice: the classes it is for with each one's length, then how to fill the
 * time, then any activities. One message, as before.
 */
export function composeIntakeReply({
  classes,
  choice,
  activityIds,
  sameLesson = true,
  severalDays = false,
  goal = null,
  balance = null,
  leads = null,
  companion = null,
  justBuild = false,
}: {
  /** Checked classes, or the one typed by hand; minutes null when not asked. */
  classes: Array<{ title: string; minutes: number | null }>;
  choice: string | null;
  activityIds: string[];
  /** Two or more classes: one lesson for all of them, or a version each. */
  sameLesson?: boolean;
  /** A unit: the minutes are each class period's (note 1). */
  severalDays?: boolean;
  /** The one thing students should leave with (Nov 26). */
  goal?: string | null;
  /** An id from LESSON_BALANCES. */
  balance?: string | null;
  /** An id from UNIT_ENDINGS. */
  leads?: string | null;
  /** A companion's own words, NO_COMPANION or PLANNER_PICKS_COMPANION. */
  companion?: string | null;
  /** "Just build": what is unanswered is the planner's to choose. */
  justBuild?: boolean;
}): string {
  const parts: string[] = classes.map((klass) =>
    klass.minutes === null
      ? `For ${klass.title}.`
      : `For ${klass.title}, ${klass.minutes} minutes${severalDays ? ' each class period' : ''}.`
  );
  // Said once, so the planner never asks again (Brian's run 4).
  if (classes.length > 1) {
    parts.push(
      sameLesson
        ? `The same lesson for ${classes.length === 2 ? 'both classes' : 'all of these classes'}.`
        : 'A version of the lesson for each class.'
    );
  }
  const chosen = choice?.trim();
  if (chosen) parts.push(isFinished(chosen) ? chosen : `${chosen}.`);
  const activities = composeAskReply({ minutes: null, activityIds });
  if (activities) parts.push(activities);
  const one = goal?.trim();
  if (one) parts.push(`If they leave with one thing: ${isFinished(one) ? one : `${one}.`}`);
  const leaning = LESSON_BALANCES.find((option) => option.id === balance);
  if (leaning) parts.push(leaning.says);
  const ending = UNIT_ENDINGS.find((option) => option.id === leads);
  if (ending) parts.push(ending.says);
  if (companion === NO_COMPANION) parts.push('No companion text.');
  else if (companion === PLANNER_PICKS_COMPANION) parts.push('You choose a companion text.');
  else if (companion?.trim()) parts.push(`Pair it with ${companion.trim().replace(/[.!?]$/, '')}.`);
  if (justBuild) parts.push('Just build it: choose the rest yourself and say in one line what you assumed.');
  return parts.join(' ');
}

/**
 * Whether the teacher is planning several days, not one lesson (Kevin, Oct 25,
 * note 1): "a unit", "a week", "five days", "8 periods". The length question
 * then asks about each class period.
 */
const WORD_NUMBERS = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|a few|multiple|many';
const SEVERAL_DAYS = new RegExp(
  String.raw`\b(?:units?|week|weeks|multi-?day|(?:\d+|${WORD_NUMBERS})[\s-]+(?:days?|periods?|lessons?|class(?:es| periods?)|sessions?))\b`,
  'i'
);
export function plansSeveralDays(request: string | null | undefined): boolean {
  return Boolean(request && SEVERAL_DAYS.test(request));
}

/**
 * Whether the request already says what the work is for (Kevin, Nov 26): a
 * goal, a focus, what students should leave with. Then nothing is asked.
 */
const PURPOSE_SAID = /\b(?:goal|objective|so that|focus(?:ed|ing)? on|i want (?:them|students|my students|kids) to|students (?:should|will|need to)|leave (?:with|able)|by the end|the point is|emphasi[sz]e|centered on|built around|just build)\b/i;
const PAIRING = /\b(?:pair(?:s|ed|ing)?|companion|alongside (?:a|another)|with a poem|paired text)\b/i;

/**
 * What this turn should ask before it builds (Nov 26: the planner, told to
 * ask, wrote the Antigone map and its own "built for" instead). Only on a
 * request that opens the work: a unit, or a lesson asking for a pairing,
 * whose purpose is not already said.
 */
export function purposeToAsk(request: string, { firstTurn }: { firstTurn: boolean }): { unit: boolean; companion: boolean } | null {
  if (!firstTurn || PURPOSE_SAID.test(request)) return null;
  const unit = plansSeveralDays(request);
  const companion = PAIRING.test(request);
  return unit || companion ? { unit, companion } : null;
}
