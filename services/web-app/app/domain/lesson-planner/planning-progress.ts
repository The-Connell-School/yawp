/**
 * What the planner is doing, while it is doing it.
 *
 * A lesson takes up to two minutes to write: the model reads the class's
 * scores, searches the Daily Pages library, opens a Lounge deck, and only then
 * starts writing. All of that used to happen behind a single spinner, which is
 * indistinguishable from a hung page — and a teacher on a prep period does not
 * wait ninety seconds on something that looks broken. They reload, and pay for
 * the whole lesson twice.
 *
 * So the turn reports its milestones as it passes them. The milestones are
 * real: each one is a tool the model actually called, named in words a teacher
 * uses rather than the function's own. That doubles as something worth
 * knowing — "Reading how the class scored" tells them what the lesson is being
 * grounded in.
 *
 * Deliberately no token streaming. A reply is prose wrapped around fenced
 * blocks — a deck's JSON, a handout, a unit map — and the route rewrites it
 * after the model stops. Streaming the raw text would show a teacher the deck's
 * braces scrolling past and then change the words under them.
 */

export type PlanningProgress = {
  /** What to say. Written for a teacher, never a function name. */
  label: string;
  /** How far along the bar should be drawn, 0 to 1, never reaching 1. */
  fraction: number;
};

/** Shown the moment the turn is accepted, so the bar is never at zero. */
export const PLANNING_PROGRESS_START: PlanningProgress = {
  label: 'Thinking about your lesson',
  fraction: 0.08,
};

/**
 * Where looking-things-up ends and writing begins.
 *
 * The tool rounds share the first stretch of the bar and the writing takes the
 * rest, because writing is the long part: a lesson with a deck is thousands of
 * tokens after the last tool call has returned.
 */
const LOOKUP_CEILING = 0.55;
const WRITING_FRACTION = 0.75;
/** How fast the lookup stretch fills. Tuned so 3 rounds is visibly halfway. */
const LOOKUP_RATE = 0.45;

/**
 * Exported so the tool module's own test can assert every allowlisted tool has
 * a line written for it. This file stays free of imports on purpose — it is
 * reached from the request path and from the browser bundle, and the tool
 * module it would otherwise import pulls in the database.
 */
export const PLANNING_PROGRESS_LABELS: Record<string, string> = {
  list_classes: 'Looking at your classes',
  get_class_grade_report: 'Reading how the class scored',
  find_students_needing_attention: 'Finding who needs the most help',
  search_daily_pages_prompts: 'Searching Class Starter prompts',
  search_short_form_prompts: 'Searching Short Response prompts',
  list_writing_lessons: 'Looking through Quick Writing Lessons',
  get_writing_lesson: 'Reading a Quick Writing Lesson',
  list_lounge_materials: "Looking through the Teacher's Lounge",
  read_lounge_material: 'Reading a Lounge deck',
  search_my_lessons: 'Looking through your saved lessons',
  read_my_lesson: 'Opening one of your lessons',
  read_uploaded_document: 'Reading your document',
  list_assignment_types: 'Checking what you can assign',
};

/**
 * A tool the allowlist gains later has no line written for it yet. Say
 * something true and general rather than the function's name — `list_classes`
 * is not a sentence, and a teacher should never be shown one.
 */
const FALLBACK_LABEL = 'Looking things up in Yawp!';

/**
 * The lookup stretch approaches its ceiling without arriving: the model can
 * call eight rounds or one, and neither is a fraction of a known total. Each
 * round covers a share of what is left, so the bar always moves and never
 * pretends to know how much is coming.
 */
function lookupFraction(round: number): number {
  const rounds = Math.max(1, Math.floor(round));
  const remaining = (1 - LOOKUP_RATE) ** rounds;
  const span = LOOKUP_CEILING - PLANNING_PROGRESS_START.fraction;
  return PLANNING_PROGRESS_START.fraction + span * (1 - remaining);
}

export function planningProgressForTool(
  name: string,
  // Taken and ignored on purpose: a tool's arguments carry class ids and
  // whatever the teacher typed, and none of it belongs in a status line.
  _input: unknown,
  round: number
): PlanningProgress {
  return {
    label: PLANNING_PROGRESS_LABELS[name] ?? FALLBACK_LABEL,
    fraction: lookupFraction(round),
  };
}

/** The last thing it says: every tool has returned and the writing has begun. */
export function planningProgressWriting(): PlanningProgress {
  return { label: 'Writing the lesson', fraction: WRITING_FRACTION };
}

/** A deck that did not validate is being written again (the repair pass): up to a minute more. */
export function planningProgressCheckingDeck(): PlanningProgress {
  return { label: 'Checking the slides', fraction: 0.9 };
}

/**
 * How long after the last lookup (or after the turn starts, with none) the
 * model is taken to be writing. Lookups come within a few seconds of each
 * other; the writing takes most of a minute.
 */
export const WRITING_AFTER_MS = 6_000;

/**
 * What to say when, through one turn (bot test, Nov 19).
 *
 * The model's reply comes back whole, so nothing announces that it has
 * stopped looking things up and started writing. "Writing the lesson" used to
 * be sent once the writing was finished, and a teacher watched "Looking
 * through the Teacher's Lounge" for a minute. Here it is said a few seconds
 * after the last lookup returns, or after the start when there is none; a
 * later lookup takes the line back; and the bar never moves backwards.
 */
export function planningProgressClock(report: (progress: PlanningProgress) => void, { afterMs = WRITING_AFTER_MS }: { afterMs?: number } = {}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let furthest = 0;
  let last = '';
  const say = (progress: PlanningProgress) => {
    furthest = Math.max(furthest, progress.fraction);
    // The same line twice is one line.
    if (progress.label === last) return;
    last = progress.label;
    report({ label: progress.label, fraction: furthest });
  };
  const wait = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => say(planningProgressWriting()), afterMs);
  };
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wait();
  return {
    /** A lookup is starting: said before it runs. */
    lookup(name: string, input: unknown, round: number) {
      stop();
      say(planningProgressForTool(name, input, round));
    },
    /** A lookup came back: the model is thinking again, and soon writing. */
    lookedUp: wait,
    /** The reply is in hand. */
    writing() {
      stop();
      say(planningProgressWriting());
    },
    /** The deck is being written a second time. */
    checkingDeck() {
      stop();
      say(planningProgressCheckingDeck());
    },
    stop,
  };
}
