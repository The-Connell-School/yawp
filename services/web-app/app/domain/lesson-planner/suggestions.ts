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

/**
 * Stack v2 (Brian's review, B6): once the teacher has filed pieces, the deck
 * and handout are built from the stack, and the chip says so.
 */
export const FROM_STACK_SUGGESTIONS = {
  deck: 'Build the slide deck from my stack',
  handout: 'Build the student handout from my stack',
} as const;

/**
 * What the stack page's build links ask the planner for (Brian's review, B6;
 * run 2, A8). Each arrives in the chat as `?build=<key>` and is sent once.
 */
export const BUILD_FROM_STACK_REQUESTS = {
  deck: FROM_STACK_SUGGESTIONS.deck,
  handout: FROM_STACK_SUGGESTIONS.handout,
  // The stack already has a deck: say so, so the planner replaces it rather
  // than answering that one already exists.
  'rebuild-deck':
    'Rebuild the slide deck from my stack, replacing the one in it',
  // Brian's run 2 (item 37): the lesson for a student who was not there.
  makeup:
    'Make a make-up handout from my stack for a student who was absent today. Tell them to go to their Assignments in YAWP! and complete the class starter and Daily Pages assignments.',
} as const;

export type BuildFromStackRequest = keyof typeof BUILD_FROM_STACK_REQUESTS;

export function isBuildFromStackRequest(
  value: string | null
): value is BuildFromStackRequest {
  return value !== null && Object.hasOwn(BUILD_FROM_STACK_REQUESTS, value);
}

/**
 * Stack v2 (Brian's review, D2): a planning session has an end. Once the
 * lesson has its deck or handout, the teacher can say so in one tap and the
 * planner wraps up.
 */
export const DONE_FOR_TODAY_SUGGESTION = "I'm done for today";

/**
 * Stack v2 (Brian's run 2, E1): under a class starter, a one-tap way to see
 * other prompts. The reply to it shows each one as a card with three choices.
 */
export const SWAP_STARTER_SUGGESTION = 'Swap out the class starter prompt';

/** Is this teacher message asking to swap the class starter? */
export function asksToSwapStarter(message: string | null | undefined): boolean {
  if (!message) return false;
  return /\b(swap|switch|replace|change|different|other)\b/i.test(message) &&
    /\bclass[- ]starter\b|\bstarter\b|\bwarm[- ]up\b/i.test(message);
}

const MAX_SUGGESTIONS = 5;

/**
 * A chip asking for a file: print, download, export, PDF, Word, Google Docs.
 *
 * Tapping a chip only sends its words as the teacher's next message, and the
 * planner cannot hand back a file. Brian clicked "Save Lesson Plan as PDF" and
 * got a document with a download button that did nothing (run 2, item 33).
 * Files come from the stack page's own buttons, so a chip like this is never
 * shown; the chat offers a link to the stack in its place.
 */
const FILE_ACTION =
  /\b(print|printable|download|export|pdf|docx|word (?:doc|document|file)|google docs?|google drive)\b|^\s*(?:create|make|save)\s+(?:a\s+|the\s+|my\s+|this\s+)?lesson\s+plan\s*(?:as\b.*|file|document)?\s*$|\bsave\b.*\bas\b/i;

export function isFileActionSuggestion(suggestion: string): boolean {
  return FILE_ACTION.test(suggestion);
}

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
export function looksLikeLessonPlan(
  body: string,
  {
    /**
     * Stack v2: a plan written as bold, timed steps ("**Read aloud (15 min)**")
     * is still a plan; missing it hid "You don't have to use all of these"
     * (Brian's run 2, E4).
     */
    boldSteps = false,
  }: { boldSteps?: boolean } = {}
): boolean {
  const headings = [...body.matchAll(/^\s{0,3}#{1,3}\s+\S/gm)].length;
  const timedSteps = boldSteps ? [...body.matchAll(TIMED_BOLD_STEP)].length : 0;
  return headings + timedSteps >= 2;
}

const MINUTES = String.raw`\b\d{1,3}\s*(?:-\s*\d{1,3}\s*)?(?:min|minutes)\b`;
// A line that opens with a bold label and names its minutes, inside the bold
// ("**Class starter (5 min)**") or just after it ("**Read aloud** (15 min)").
const TIMED_BOLD_STEP = new RegExp(
  String.raw`^\s{0,3}(?:(?:[-*+]|\d+[.)])\s+)?\*\*(?:[^*\n]{0,80}?${MINUTES}[^*\n]*\*\*|[^*\n]{2,80}\*\*[^\n]{0,40}?${MINUTES})`,
  'gim'
);

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
    /** Stack v2: offer a one-tap way to end the session once something is built. */
    offerDone = false,
    /** Stack v2: the teacher has filed pieces, so outputs come from the stack. */
    stackHasPieces = false,
    /** Stack v2: this reply offered a class starter, so offer to swap it. */
    offerStarterSwap = false,
  }: {
    isOpeningReply: boolean;
    teacherRaisedRoomPersonality?: boolean;
    deliveredPlan?: boolean;
    produced?: ArtifactFlags;
    inPacket?: ArtifactFlags;
    asksForMinutes?: boolean;
    offerDone?: boolean;
    stackHasPieces?: boolean;
    offerStarterSwap?: boolean;
  }
): string[] {
  const picked = pickSuggestions(suggestions, {
    isOpeningReply,
    teacherRaisedRoomPersonality,
    deliveredPlan,
    produced,
    inPacket,
    asksForMinutes,
    stackHasPieces,
  });
  const chips =
    offerStarterSwap
      ? [
          ...picked
            .filter((chip) => !asksToSwapStarter(chip))
            .slice(0, MAX_SUGGESTIONS - 1),
          SWAP_STARTER_SUGGESTION,
        ]
      : picked;
  const somethingBuilt =
    produced.deck || produced.handout || inPacket.deck || inPacket.handout;
  if (!offerDone || isOpeningReply || !somethingBuilt) return chips;
  return [
    ...chips
      .filter((chip) => normalize(chip) !== normalize(DONE_FOR_TODAY_SUGGESTION))
      .slice(0, MAX_SUGGESTIONS - 1),
    DONE_FOR_TODAY_SUGGESTION,
  ];
}

function pickSuggestions(
  suggestions: string[],
  {
    isOpeningReply,
    teacherRaisedRoomPersonality,
    deliveredPlan,
    produced,
    inPacket,
    asksForMinutes,
    stackHasPieces,
  }: {
    isOpeningReply: boolean;
    teacherRaisedRoomPersonality: boolean;
    deliveredPlan: boolean;
    produced: ArtifactFlags;
    inPacket: ArtifactFlags;
    asksForMinutes: boolean;
    stackHasPieces: boolean;
  }
): string[] {
  const followOn = stackHasPieces ? FROM_STACK_SUGGESTIONS : FOLLOW_ON_SUGGESTIONS;
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
    if (!key || seen.has(key) || isFileActionSuggestion(suggestion)) continue;
    seen.add(key);
    deduped.push(suggestion);
  }

  // A teacher who gave full context up front gets a plan on the very first
  // reply. Pinning "look at my classes and tell me what they need work on"
  // after a finished plan reads as though nothing was just handed over — what
  // they want next is the deck and the handout.
  if (isOpeningReply && !deliveredPlan) {
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
  if (!produced.deck && !inPacket.deck) pinned.push(followOn.deck);
  if (!produced.handout && !inPacket.handout) {
    pinned.push(followOn.handout);
  }
  if (!pinned.length) return deduped.slice(0, MAX_SUGGESTIONS);

  return [
    ...pinned,
    // The model's own "build a slide deck…" would sit right beside ours.
    ...deduped.filter(
      (suggestion) =>
        !(
          pinned.includes(followOn.deck) &&
          DECK_INTENT.test(suggestion)
        ) &&
        !(
          pinned.includes(followOn.handout) &&
          HANDOUT_INTENT.test(suggestion)
        )
    ),
  ].slice(0, MAX_SUGGESTIONS);
}
