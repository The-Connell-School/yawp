// What a v3 exit ticket asks students to do.
//
// The quick builder composed the prompt from a fill-in-the-blank sentence.
// The v3 builder hands the prompt back to the teacher and asks one question
// first instead: what will the students do? Each answer is described in a
// sentence or two that steers toward one purposeful ask rather than a default
// habit, and decides the closing line the product appends.
//
// Copy follows Brian's "Assignment-Type Homepages — Copy Edits" (Exit Ticket
// page and its wording rule). Kept free of imports so `exit-ticket.ts` can
// build on it without a cycle.

/** Bounds a prompt with a few questions about a passage, not an essay brief. */
export const EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH = 1000;

export const EXIT_TICKET_ACTIVITIES = [
  'reflect',
  'explain-concept',
  'answer-question',
  'engage-text',
] as const;
export type ExitTicketActivity = (typeof EXIT_TICKET_ACTIVITIES)[number];

/** Opens on the one-click ticket: a reflection with a starter already in. */
export const DEFAULT_EXIT_TICKET_ACTIVITY: ExitTicketActivity = 'reflect';

/**
 * Explain-it-in-your-own-words tickets end with exactly this line (Brian's
 * wording rule). It replaces the "someone who missed class" / "not the
 * definition you were given" ending.
 */
export const EXIT_TICKET_EXPLAIN_CLOSER =
  'Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don’t worry too much about polish. This is about what you understand, not writing perfectly.';

/**
 * Every other ticket. Not every exit ticket is a "write more" situation: a
 * question they still have, or a quick check with an answer, just asks. A
 * short polish note is fine anywhere, since exit tickets are not graded on
 * grammar or polish.
 */
export const EXIT_TICKET_POLISH_CLOSER = 'Don’t worry about polish.';

export type ExitTicketActivityKind = 'reflection' | 'check';

/** The legacy focus a check dual-writes, so pre-v3 readers still parse it. */
export type ExitTicketLegacyFocus = 'explain-concept' | 'understand-text';

export type ExitTicketActivityOption = {
  value: ExitTicketActivity;
  kind: ExitTicketActivityKind;
  label: string;
  /** Shown under the label: what to ask for, and why it is worth asking. */
  description: string;
  placeholder: string;
  /** Null for a reflection: its closer follows the starter, if any. */
  closer: string | null;
  legacyFocus: ExitTicketLegacyFocus | null;
  /** How the grader reads the shared bands for this activity. */
  gradingCriteria: string;
};

export const EXIT_TICKET_ACTIVITY_OPTIONS: ExitTicketActivityOption[] = [
  {
    value: 'reflect',
    kind: 'reflection',
    label: 'Have the students reflect or ask a question',
    description:
      'They tell you what landed, what surprised them, or what they still don’t get. Good for hearing about the things you didn’t think to ask.',
    placeholder: 'e.g., What is one question you still have about today’s lesson?',
    closer: null,
    legacyFocus: null,
    gradingCriteria:
      'This is a reflection, so there is no single right answer. Judge whether the response is specific to the lesson and honest about where the student is. Where the prompt asks what they are still wondering, not knowing is the task and never a failure: a question that only someone who followed the lesson could ask is strong evidence of understanding, and one that could have been asked before the lesson is weak evidence of it.',
  },
  {
    value: 'explain-concept',
    kind: 'check',
    label: 'Have the students explain a concept',
    description:
      'Ask them to explain, not recall. Putting the idea in their own words shows who understood it, not who memorized a sentence.',
    placeholder:
      'e.g., In your own words, explain how Edwards uses reason and emotion together to persuade.',
    closer: EXIT_TICKET_EXPLAIN_CLOSER,
    legacyFocus: 'explain-concept',
    gradingCriteria:
      'Judge whether the student can explain the idea in their own words and whether the explanation holds up. Fluent phrasing borrowed from the teacher or the textbook, with nothing showing the student has made the idea theirs, is names it only however polished it sounds.',
  },
  {
    value: 'answer-question',
    kind: 'check',
    label: 'Have the students answer a question',
    description:
      'Ask a quick question about what you just taught to see who got it. Add the answer below. A right answer in different words, or misspelled, still counts.',
    placeholder:
      'e.g., Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?',
    closer: EXIT_TICKET_POLISH_CLOSER,
    legacyFocus: 'explain-concept',
    gradingCriteria:
      'The teacher asked a specific question. Judge whether the response answers it correctly, reading for meaning rather than phrasing: the right answer in the student’s own words, in a different order, or with a misspelled name or term is still the right answer. A response that answers a different question, or contradicts the key points, is not there yet. Do not ask for more length than the question needs.',
  },
  {
    value: 'engage-text',
    kind: 'check',
    label: 'Have the students engage with a text or source',
    description:
      'Point them at a passage, poem, image or document from the lesson and have them work with it: find features in a poem, or answer a few questions about the text.',
    placeholder:
      'e.g., Reread the second stanza. Find two examples of enjambment and say what each one does to the poem’s pace.',
    closer: EXIT_TICKET_POLISH_CLOSER,
    legacyFocus: 'understand-text',
    gradingCriteria:
      'Judge whether the response actually works with the source the teacher named: whether it points at specific features, lines or details, and whether what it says about them holds up. Where the prompt asks several questions, read each one; a response that answers some well and skips others is partly there.',
  },
];

export type ExitTicketActivityGroup = {
  kind: ExitTicketActivityKind;
  label: string;
  description: string;
  activities: ExitTicketActivity[];
};

export const EXIT_TICKET_ACTIVITY_GROUPS: ExitTicketActivityGroup[] = [
  {
    kind: 'reflection',
    label: 'Reflection / question',
    description:
      'Students tell you what they learned, what surprised them, or what they’re still wondering.',
    activities: ['reflect'],
  },
  {
    kind: 'check',
    label: 'Check for understanding',
    description:
      'Name what you’re checking and let students show it. You can add the correct answer or key points.',
    activities: ['explain-concept', 'answer-question', 'engage-text'],
  },
];

export const EXIT_TICKET_STARTERS = ['learned', 'surprised', 'wondering'] as const;
export type ExitTicketStarter = (typeof EXIT_TICKET_STARTERS)[number];

export type ExitTicketStarterOption = {
  id: ExitTicketStarter;
  label: string;
  prompt: string;
  closer: string;
};

/**
 * One tap fills the reflection prompt box. A starter only decides the closer
 * while its words are unchanged: a teacher who rewrites it has written their
 * own question, and gets the closer for that.
 */
export const EXIT_TICKET_STARTER_OPTIONS: ExitTicketStarterOption[] = [
  {
    id: 'learned',
    label: 'What I learned',
    prompt: 'What did you learn today? Explain it in your own words.',
    closer: EXIT_TICKET_EXPLAIN_CLOSER,
  },
  {
    id: 'surprised',
    label: 'What surprised me',
    prompt:
      'What surprised you in today’s lesson? Say what it was and why it caught your attention.',
    closer: EXIT_TICKET_POLISH_CLOSER,
  },
  {
    id: 'wondering',
    label: 'Still wondering',
    prompt: 'What is one question you still have about today’s lesson?',
    closer: EXIT_TICKET_POLISH_CLOSER,
  },
];

export const DEFAULT_EXIT_TICKET_STARTER: ExitTicketStarter = 'learned';

export function exitTicketActivityOption(
  value: string | null | undefined
): ExitTicketActivityOption | null {
  return (
    EXIT_TICKET_ACTIVITY_OPTIONS.find((option) => option.value === value) ??
    null
  );
}

export function exitTicketStarterOption(
  id: string | null | undefined
): ExitTicketStarterOption | null {
  return EXIT_TICKET_STARTER_OPTIONS.find((option) => option.id === id) ?? null;
}

export function exitTicketActivityKind(
  activity: ExitTicketActivity
): ExitTicketActivityKind {
  return exitTicketActivityOption(activity)?.kind ?? 'reflection';
}

/** The line appended after the teacher's prompt. */
export function exitTicketCloser(
  activity: ExitTicketActivity,
  starter?: ExitTicketStarter | null
): string {
  if (activity === 'reflect') {
    return exitTicketStarterOption(starter)?.closer ?? EXIT_TICKET_POLISH_CLOSER;
  }
  return exitTicketActivityOption(activity)?.closer ?? EXIT_TICKET_POLISH_CLOSER;
}

/**
 * Tidies whitespace without flattening the prompt: a few numbered questions
 * about a passage keep their lines.
 */
export function normalizeExitTicketPromptText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\r]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
