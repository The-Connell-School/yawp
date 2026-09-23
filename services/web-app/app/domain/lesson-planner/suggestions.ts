/**
 * Suggestion chips for the planner's opening turn.
 *
 * The planner opens by asking what to plan, and the single most useful answer
 * is "you tell me — look at the data". That option should be there every time,
 * in the same words, in the same place. Leaving it to the model means it
 * appears in a different form each run, or not at all, which is exactly what a
 * teacher who reaches for it every day does not want.
 *
 * So the app pins it, and the model's own options follow. The app also keeps
 * the model off one subject it will not stop volunteering — how talkative the
 * class is — until the teacher brings it up themselves.
 */

/**
 * Always first on the opening turn. Phrased as something the teacher is saying,
 * because tapping a chip sends it as their message.
 */
export const STANDARD_OPENING_SUGGESTION =
  'Look at my classes and tell me what they need work on';

/**
 * What always comes next once a plan exists.
 *
 * A teacher who has just approved a lesson wants one of two things, and the
 * planner should not have to think of them. Pinned like the opening option, in
 * the same words every time, so the move is muscle memory rather than a lucky
 * suggestion.
 */
export const FOLLOW_ON_SUGGESTIONS = {
  deck: 'Build the slide deck for this lesson',
  handout: 'Build the student handout for this lesson',
} as const;

const MAX_SUGGESTIONS = 5;

function normalize(suggestion: string): string {
  return suggestion
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Phrases that mean the same thing as the standard option. When the model
// writes its own version, the pinned one replaces it rather than sitting
// beside it saying nearly the same words.
const SAME_INTENT = [
  'look at my class',
  'look at their grades',
  'check my class',
  'see my class list',
  'show me my class list',
  'pull the data',
  'pull real data',
  'decide what they need',
  'tell me what they need',
  'you pick the skill',
  'find the weakest',
];

function meansTheSameThing(suggestion: string): boolean {
  const normalized = normalize(suggestion);
  return SAME_INTENT.some((phrase) => normalized.includes(normalize(phrase)));
}

/**
 * How chatty the room is, as a topic.
 *
 * Talkative-versus-quiet is a real axis to differentiate on, but it is one of
 * many, and the planner had made it *the* axis: every option came back as a
 * skill crossed with the room's temperament, for teachers who had never
 * mentioned it. These terms are how that shows up in an option.
 */
const ROOM_TERMS =
  /\b(talkative|chatty|introvert(?:ed|s)?|extrovert(?:ed|s)?|outgoing|shy|timid|rowdy|reluctant|unresponsive|participation|they talk|won'?t talk|pulling teeth)\b/i;

/** Words that only describe the room when they sit next to the room. */
const ROOM_MOOD_SOURCE =
  '\\b(quiet(?:er)?|loud(?:er)?|energetic|talky|engaged|disengaged)\\b';
const ROOM_MOOD = new RegExp(ROOM_MOOD_SOURCE, 'gi');
const ROOM_MOOD_ONCE = new RegExp(ROOM_MOOD_SOURCE, 'i');
const ROOM_NOUN =
  /\b(room|group|class(?:es)?|section|kids|students|bunch|crowd)\b/gi;
const NEARBY_CHARS = 25;
/** "…, 45 min, quiet" — a clause this short is describing the class. */
const TERSE_CLAUSE_WORDS = 3;

function indicesOf(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) => match.index ?? 0);
}

function describesTheRoom(text: string): boolean {
  if (ROOM_TERMS.test(text)) return true;
  if (!ROOM_MOOD_ONCE.test(text)) return false;
  // A bare "quiet" tacked onto an option is the room; "10 minutes of quiet
  // writing" is the lesson.
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= TERSE_CLAUSE_WORDS) return true;
  // Otherwise it counts only when it sits next to the class itself.
  const moods = indicesOf(text, ROOM_MOOD);
  const nouns = indicesOf(text, ROOM_NOUN);
  return moods.some((mood) =>
    nouns.some((noun) => Math.abs(mood - noun) <= NEARBY_CHARS)
  );
}

/** Has the teacher themselves brought up what the room is like? */
export function mentionsRoomPersonality(teacherMessages: string[]): boolean {
  return teacherMessages.some(describesTheRoom);
}

// Clause boundaries a one-line option is actually written with.
const CLAUSES = /(\s*[—–]\s*|\s*,\s*|\s*;\s*|\s+-\s+)/;

/**
 * Take the room back out of an option the teacher never asked about.
 *
 * An option built on the room ("They talk freely — I need structure") goes
 * entirely; one that merely tacks it on ("Evidence/Support — 50-minute period,
 * talkative room") keeps the part the teacher actually wanted. Two options that
 * differed only by temperament then collapse into one.
 */
function withoutRoomTalk(suggestion: string): string {
  const parts = suggestion.split(CLAUSES);
  const clauses: Array<{ separator: string; text: string }> = [];
  for (let index = 0; index < parts.length; index += 2) {
    clauses.push({
      separator: index === 0 ? '' : (parts[index - 1] ?? ''),
      text: parts[index] ?? '',
    });
  }

  // The lead clause is what the option is about. If that is the room, the whole
  // option is about the room.
  if (!clauses.length || describesTheRoom(clauses[0]!.text)) return '';

  const kept = clauses.filter((clause) => !describesTheRoom(clause.text));
  return kept
    .map((clause, index) =>
      index === 0 ? clause.text : clause.separator + clause.text
    )
    .join('')
    .trim();
}

/**
 * A clause that is nothing but how long the period runs.
 *
 * "50 minutes", "80-minute block", "45 min period" — the answer the slider
 * exists to give.
 */
const PERIOD_LENGTH =
  /^\s*(?:about\s+|roughly\s+|~\s*)?\d{1,3}\s*(?:-|\s)?\s*(?:min(?:ute)?s?|hr|hour)\b[^,;—–]*$/i;

/**
 * Take the period length out of an option offered beside the minutes slider.
 *
 * Asking for the length with a control and then offering "50 minutes" as
 * something to tap is the same question asked twice, and the two answers
 * disagree the moment the teacher drags the slider. The rest of the option is
 * still worth keeping: "English 10 · Period 3, 50 minutes" becomes
 * "English 10 · Period 3".
 */
export function withoutPeriodLength(suggestion: string): string {
  const parts = suggestion.split(CLAUSES);
  const clauses: Array<{ separator: string; text: string }> = [];
  for (let index = 0; index < parts.length; index += 2) {
    clauses.push({
      separator: index === 0 ? '' : (parts[index - 1] ?? ''),
      text: parts[index] ?? '',
    });
  }

  const kept = clauses.filter((clause) => !PERIOD_LENGTH.test(clause.text));
  // An option that was only ever the length has nothing left to offer.
  if (!kept.length) return '';
  return kept
    .map((clause, index) =>
      index === 0 ? clause.text : clause.separator + clause.text
    )
    .join('')
    .trim();
}

/**
 * Merge the model's suggestions with the pinned opening option.
 *
 * Only the opening reply gets the pin — later turns are about the lesson in
 * progress, where the model's own suggestions are the useful ones.
 */
/**
 * A reply built out of sections, rather than a question or a single answer —
 * which is when "now build the deck" becomes the useful next thing to offer.
 */
export function looksLikeLessonPlan(body: string): boolean {
  return [...body.matchAll(/^\s{0,3}#{1,3}\s+\S/gm)].length >= 2;
}

const DECK_INTENT = /\b(slide|deck|slides)\b/i;
const HANDOUT_INTENT = /\b(handout|worksheet|packet for students)\b/i;

type ArtifactFlags = { deck?: boolean; handout?: boolean };

export function withStandardSuggestions(
  suggestions: string[],
  {
    isOpeningReply,
    // Default true: a caller that cannot tell should not have its options
    // rewritten out from under it.
    teacherRaisedRoomPersonality = true,
    /** This reply handed over a lesson plan, so the artifacts are next. */
    deliveredPlan = false,
    /** What this reply already built, so it is not offered again. */
    produced = {},
    /** What the lesson's packet already holds. */
    inPacket = {},
    /** This reply drew the minutes slider, so it owns the question of length. */
    asksForMinutes = false,
    /**
     * Whether the opening turn pins the data-driven option. False when the
     * teacher started from a tile that asked for something else — see
     * `pinsDataOpening`.
     */
    pinOpening = true,
  }: {
    isOpeningReply: boolean;
    teacherRaisedRoomPersonality?: boolean;
    deliveredPlan?: boolean;
    produced?: ArtifactFlags;
    inPacket?: ArtifactFlags;
    asksForMinutes?: boolean;
    pinOpening?: boolean;
  }
): string[] {
  const withoutRoom = teacherRaisedRoomPersonality
    ? suggestions
    : suggestions.map(withoutRoomTalk);
  const offered = asksForMinutes
    ? withoutRoom.map(withoutPeriodLength)
    : withoutRoom;

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const suggestion of offered) {
    const key = normalize(suggestion);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(suggestion);
  }

  // A teacher who gave full context up front gets a plan on the very first
  // reply. Pinning "look at my classes and tell me what they need work on"
  // after a finished plan reads as though nothing was just handed over — what
  // they want next is the deck and the handout.
  if (isOpeningReply && !deliveredPlan && pinOpening) {
    return [
      STANDARD_OPENING_SUGGESTION,
      ...deduped.filter(
        (suggestion) =>
          normalize(suggestion) !== normalize(STANDARD_OPENING_SUGGESTION) &&
          !meansTheSameThing(suggestion)
      ),
    ].slice(0, MAX_SUGGESTIONS);
  }

  if (!deliveredPlan) return deduped.slice(0, MAX_SUGGESTIONS);

  const pinned: string[] = [];
  if (!produced.deck && !inPacket.deck) pinned.push(FOLLOW_ON_SUGGESTIONS.deck);
  if (!produced.handout && !inPacket.handout) {
    pinned.push(FOLLOW_ON_SUGGESTIONS.handout);
  }
  if (!pinned.length) return deduped.slice(0, MAX_SUGGESTIONS);

  return [
    ...pinned,
    // The model's own "build a slide deck…" would sit right beside ours.
    ...deduped.filter(
      (suggestion) =>
        !(
          pinned.includes(FOLLOW_ON_SUGGESTIONS.deck) &&
          DECK_INTENT.test(suggestion)
        ) &&
        !(
          pinned.includes(FOLLOW_ON_SUGGESTIONS.handout) &&
          HANDOUT_INTENT.test(suggestion)
        )
    ),
  ].slice(0, MAX_SUGGESTIONS);
}
