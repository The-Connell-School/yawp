// What a v3 exit ticket asks students to do.
//
// The form asks one question, "What will students do?", and every answer is
// either a reflection or a check for understanding:
//
// - Reflection: What I learned, Most interesting, Still wondering, or a
//   question the teacher writes. The first three are fixed prompts.
// - Check: explain a concept in their own words (the teacher names the
//   concept), answer a question, or grapple with a text or source (the teacher
//   writes the prompt for both).
//
// Kept free of imports so `exit-ticket.ts` can build on it without a cycle.

/** Bounds a prompt with a few questions about a passage, not an essay brief. */
export const EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH = 1000;

export const EXIT_TICKET_ACTIVITIES = [
  'reflect',
  'explain-concept',
  'answer-question',
  'engage-text',
] as const;
export type ExitTicketActivity = (typeof EXIT_TICKET_ACTIVITIES)[number];

/** Opens on the one-click ticket: "What I learned". */
export const DEFAULT_EXIT_TICKET_ACTIVITY: ExitTicketActivity = 'reflect';

/**
 * The one closing line, for tickets that ask students to explain something.
 * Questions and quick checks get no closing line at all.
 */
export const EXIT_TICKET_EXPLAIN_CLOSER =
  'Write as much as you can. Don’t worry about polish.';

export type ExitTicketActivityKind = 'reflection' | 'check';

/** The legacy focus a check dual-writes, so pre-v3 readers still parse it. */
export type ExitTicketLegacyFocus = 'explain-concept' | 'understand-text';

export type ExitTicketActivityOption = {
  value: ExitTicketActivity;
  kind: ExitTicketActivityKind;
  label: string;
  placeholder: string;
  /** Null when the ticket ends with the teacher's own words. */
  closer: string | null;
  legacyFocus: ExitTicketLegacyFocus | null;
  /** How the grader reads the shared bands for this activity. */
  gradingCriteria: string;
};

export const EXIT_TICKET_ACTIVITY_OPTIONS: ExitTicketActivityOption[] = [
  {
    value: 'reflect',
    kind: 'reflection',
    label: 'Reflect on the lesson',
    placeholder: 'e.g., What would you tell a friend about today’s lesson?',
    closer: null,
    legacyFocus: null,
    gradingCriteria:
      'This is a reflection, so there is no single right answer. Judge whether the response is specific to the lesson and honest about where the student is. If the prompt asks for a question they still have, not knowing is the task, not a failure: a question only someone who followed the lesson could ask is strong evidence of understanding.',
  },
  {
    value: 'explain-concept',
    kind: 'check',
    label: 'Explain a concept in their own words',
    placeholder: 'e.g., how Edwards uses reason and emotion together',
    closer: EXIT_TICKET_EXPLAIN_CLOSER,
    legacyFocus: 'explain-concept',
    gradingCriteria:
      'Judge whether the student can explain the idea in their own words and whether the explanation holds up. Phrasing copied from the teacher or the textbook, with nothing showing the student understands it, is names it only.',
  },
  {
    value: 'answer-question',
    kind: 'check',
    label: 'Answer a question',
    placeholder:
      'e.g., Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?',
    closer: null,
    legacyFocus: 'explain-concept',
    gradingCriteria:
      'The teacher asked a specific question. Judge whether the response answers it, reading for meaning rather than wording. Do not ask for more length than the question needs.',
  },
  {
    value: 'engage-text',
    kind: 'check',
    label: 'Grapple with a text or source',
    placeholder:
      'e.g., Reread the second stanza. Find two examples of enjambment and say what each one does to the poem’s pace.',
    closer: null,
    legacyFocus: 'understand-text',
    gradingCriteria:
      'Judge whether the response works with the source the teacher named: whether it points at specific lines or details, and whether what it says about them holds up. If the prompt asks several questions, read each one; answering some and skipping others is partly there.',
  },
];

/** Builds "In your own words, explain {concept}." from what the teacher typed. */
export function composeExplainConceptPrompt(topic: string): string {
  const concept = topic
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?\s]+$/u, '');
  return concept ? `In your own words, explain ${concept}.` : '';
}

/**
 * The reflection prompts. `custom` is the teacher's own question; the others
 * are fixed, so they need nothing typed.
 */
export const EXIT_TICKET_STARTERS = [
  'learned',
  'interesting',
  'wondering',
] as const;
export type ExitTicketStarter = (typeof EXIT_TICKET_STARTERS)[number];

export type ExitTicketStarterOption = {
  id: ExitTicketStarter;
  label: string;
  prompt: string;
  closer: string | null;
};

export const EXIT_TICKET_STARTER_OPTIONS: ExitTicketStarterOption[] = [
  {
    id: 'learned',
    label: 'What I learned',
    prompt: 'What did you learn today? Explain it in your own words.',
    closer: EXIT_TICKET_EXPLAIN_CLOSER,
  },
  {
    id: 'interesting',
    label: 'Most interesting',
    prompt: 'What was the most interesting part of today’s lesson? Why?',
    closer: null,
  },
  {
    id: 'wondering',
    label: 'Still wondering',
    prompt: 'What is one question you still have about today’s lesson?',
    closer: null,
  },
];

export const DEFAULT_EXIT_TICKET_STARTER: ExitTicketStarter = 'learned';

/**
 * Every choice under "What will students do?", in order. A reflection is one
 * of its fixed prompts or the teacher's own question; a check is one of the
 * check activities.
 */
export type ExitTicketChoice =
  | `reflect:${ExitTicketStarter}`
  | 'reflect:custom'
  | Exclude<ExitTicketActivity, 'reflect'>;

export type ExitTicketChoiceOption = {
  value: ExitTicketChoice;
  label: string;
};

export type ExitTicketChoiceGroup = {
  kind: ExitTicketActivityKind;
  label: string;
  choices: ExitTicketChoiceOption[];
};

export const EXIT_TICKET_CHOICE_GROUPS: ExitTicketChoiceGroup[] = [
  {
    kind: 'reflection',
    label: 'Reflection',
    choices: [
      ...EXIT_TICKET_STARTER_OPTIONS.map((option) => ({
        value: `reflect:${option.id}` as const,
        label: option.label,
      })),
      { value: 'reflect:custom', label: 'Write your own question' },
    ],
  },
  {
    kind: 'check',
    label: 'Check for understanding',
    choices: EXIT_TICKET_ACTIVITY_OPTIONS.filter(
      (option) => option.kind === 'check'
    ).map((option) => ({
      value: option.value as Exclude<ExitTicketActivity, 'reflect'>,
      label: option.label,
    })),
  },
];

export function exitTicketChoiceFor(
  activity: ExitTicketActivity,
  starter: ExitTicketStarter | null
): ExitTicketChoice {
  if (activity !== 'reflect') return activity;
  return starter ? `reflect:${starter}` : 'reflect:custom';
}

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

/** The line appended after the prompt, or null for none. */
export function exitTicketCloser(
  activity: ExitTicketActivity,
  starter?: ExitTicketStarter | null
): string | null {
  if (activity === 'reflect') {
    return exitTicketStarterOption(starter)?.closer ?? null;
  }
  return exitTicketActivityOption(activity)?.closer ?? null;
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
