// The Exit Ticket assignment type.
//
// Daily Pages is open-ended: the student writes, and the teacher reads for
// effort. An exit ticket does the opposite job — it is the short piece of
// writing at the end of a lesson that tells the teacher whether the lesson
// landed. So the teacher does not write a prompt here at all. They answer two
// questions in the creation sheet and the student-facing prompt is composed
// from the answers, which keeps every exit ticket in the product phrased the
// same way and keeps "what was this checking?" recoverable later.
//
// Both shapes are writing. Neither is multiple choice, and nothing here is
// auto-scored: the point is to read what the student actually says.
//
// This module is imported by the creation sheet as well as by the server, so
// it stays free of database and framework imports.

/** The `AssignmentType.kind` Exit Ticket rows carry. */
export const EXIT_TICKET_ASSIGNMENT_TYPE_KIND = 'exit_ticket';

/**
 * Single switch for the feature, matching `SAVED_ASSIGNMENTS_ENABLED`. Off
 * hides the exit ticket form everywhere and leaves an exit ticket assignment
 * type behaving like any other prompt-driven type, so the assignment type row
 * can ship ahead of the UI and nothing already created changes.
 */
export const EXIT_TICKETS_ENABLED = true;

/** Bumped only if a stored config ever has to be read two ways at once. */
export const EXIT_TICKET_CONFIG_SCHEMA_VERSION = 1 as const;

/**
 * `basic` is the standard end-of-lesson check, worded the same for every
 * lesson. `specific` names what the teacher wants evidence of.
 */
export const EXIT_TICKET_MODES = ['basic', 'specific'] as const;
export type ExitTicketMode = (typeof EXIT_TICKET_MODES)[number];

/** What the sheet opens on: the one-click option, not the one with fields. */
export const DEFAULT_EXIT_TICKET_MODE: ExitTicketMode = 'basic';

/**
 * Long enough for "the difference between weathering and erosion", short
 * enough that the field cannot quietly become a second prompt box — the
 * composed sentence has to stay readable to a student.
 */
export const EXIT_TICKET_TOPIC_MAX_LENGTH = 200;

export type ExitTicketFocus =
  | 'explain-concept'
  | 'apply-skill'
  | 'understand-text'
  | 'clear-up-confusion'
  | 'connect-learning'
  | 'judge-understanding';

export type ExitTicketFocusOption = {
  value: ExitTicketFocus;
  /** The dropdown row. */
  label: string;
  /** Shown under the dropdown, so the teacher can tell the options apart. */
  helperText: string;
  /** The topic field's placeholder, phrased to fit this option's sentence. */
  topicPlaceholder: string;
  /** `{topic}` is replaced with what the teacher typed. */
  template: string;
};

/**
 * The kinds of understanding an exit ticket can check for. Each one is a
 * sentence with a hole in it: the teacher picks the sentence and fills the
 * hole, rather than writing a prompt from scratch at the end of a class.
 */
export const EXIT_TICKET_FOCUS_OPTIONS: ExitTicketFocusOption[] = [
  {
    value: 'explain-concept',
    label: 'Explain a concept',
    helperText:
      'Can they put the idea in their own words instead of repeating yours?',
    topicPlaceholder: 'e.g., the causes of World War I',
    template:
      'In your own words, explain {topic}. Write it the way you would explain it to someone who missed class today — not the definition you were given, but what you actually understand it to mean.',
  },
  {
    value: 'apply-skill',
    label: 'Apply a skill',
    helperText: 'Can they use today’s skill, and show their thinking doing it?',
    topicPlaceholder: 'e.g., solving a two-step equation',
    template:
      'Show me how you would go about {topic}. Walk through your thinking one step at a time, and explain why each step comes where it does.',
  },
  {
    value: 'understand-text',
    label: 'Understand a text or source',
    helperText: 'Did they read it closely, or just get the gist?',
    topicPlaceholder: 'e.g., the second stanza of the poem',
    template:
      'What is {topic} actually saying? Put it in your own words, then point to what in it made you read it that way.',
  },
  {
    value: 'clear-up-confusion',
    label: 'Surface what’s still confusing',
    helperText:
      'Names the fuzzy part, so tomorrow can start where today ran out.',
    topicPlaceholder: 'e.g., how to balance a chemical equation',
    template:
      'What part of {topic} still doesn’t sit right with you? Name the piece that is fuzzy, then say what you think might be going on and where you get stuck.',
  },
  {
    value: 'connect-learning',
    label: 'Connect it to earlier learning',
    helperText: 'Does today sit alongside what came before, or float free?',
    topicPlaceholder: 'e.g., the New Deal',
    template:
      'How does {topic} connect to what we have already worked on this unit? Say what lines up with what you already knew, and what does not fit as neatly as you expected.',
  },
  {
    value: 'judge-understanding',
    label: 'Self-assess understanding',
    helperText: 'Asks them to be honest about where they actually are.',
    topicPlaceholder: 'e.g., today’s lesson on cell division',
    template:
      'How well do you really understand {topic} right now? Be honest — say what you could already teach to someone else, and what you would still get stuck on if I asked you about it tomorrow.',
  },
];

/** The standard prompt every basic exit ticket asks. */
export const BASIC_EXIT_TICKET_PROMPT =
  'Tell me, in your own words, what you learned today. Don’t just name the topic — explain what you understand now that you didn’t understand at the start of class, and be honest about the parts you are still unsure of.';

/**
 * Appended to both shapes. Exit tickets are short by nature, and without this
 * a lot of students answer in one line; the ask for elaboration is the whole
 * difference between a check that tells the teacher something and one that
 * does not.
 */
export const EXIT_TICKET_ELABORATION_NOTE =
  'Write as much as you can, and go further than your first sentence — the more you explain your thinking, the more this is worth. Don’t worry about polish. This is about what you understand, not how neatly you say it.';

export type ExitTicketConfig =
  | { schemaVersion: typeof EXIT_TICKET_CONFIG_SCHEMA_VERSION; mode: 'basic' }
  | {
      schemaVersion: typeof EXIT_TICKET_CONFIG_SCHEMA_VERSION;
      mode: 'specific';
      focus: ExitTicketFocus;
      topic: string;
    };

/**
 * Whether an assignment type is an exit ticket. Keyed on `kind` and never on
 * the title, so an organization is free to call theirs "Ticket Out The Door"
 * and a type that merely happens to be titled "Exit Ticket" is untouched.
 */
export function isExitTicketAssignmentType(
  assignmentType: { kind?: string | null } | null | undefined
): boolean {
  return assignmentType?.kind === EXIT_TICKET_ASSIGNMENT_TYPE_KIND;
}

export function exitTicketFocusOption(
  value: string | null | undefined
): ExitTicketFocusOption | null {
  return (
    EXIT_TICKET_FOCUS_OPTIONS.find((option) => option.value === value) ?? null
  );
}

/**
 * Teachers type a phrase, not a sentence fragment engineered to slot into
 * ours. Collapsing whitespace and dropping terminal punctuation is what keeps
 * "the causes of WWI." from composing into "explain the causes of WWI..".
 */
function normalizeTopic(topic: string): string {
  return topic
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?\s]+$/u, '');
}

/** The prompt the student actually sees. */
export function composeExitTicketPrompt(config: ExitTicketConfig): string {
  if (config.mode === 'basic') {
    return `${BASIC_EXIT_TICKET_PROMPT}\n\n${EXIT_TICKET_ELABORATION_NOTE}`;
  }

  const option = exitTicketFocusOption(config.focus);
  // An unknown focus can only mean a stored row from a future or renamed
  // option set. Falling back to the standard prompt keeps the assignment
  // readable rather than showing a student a template with a hole in it.
  if (!option) {
    return `${BASIC_EXIT_TICKET_PROMPT}\n\n${EXIT_TICKET_ELABORATION_NOTE}`;
  }

  const sentence = option.template.replace(
    '{topic}',
    normalizeTopic(config.topic)
  );
  return `${sentence}\n\n${EXIT_TICKET_ELABORATION_NOTE}`;
}

export type ExitTicketConfigParseResult =
  | { success: true; config: ExitTicketConfig }
  | { success: false; message: string };

export type ExitTicketConfigInput = {
  mode?: string | null;
  focus?: string | null;
  topic?: string | null;
};

/**
 * Writing: strict about the specific path, forgiving about an absent mode.
 *
 * An absent mode is the backward-compatible case — a client that does not
 * render the toggle posts nothing — and it yields the basic exit ticket. An
 * explicitly wrong mode is a bug worth reporting rather than silently
 * downgrading, because the teacher chose something we did not understand.
 */
export function parseExitTicketConfigInput(
  input: ExitTicketConfigInput
): ExitTicketConfigParseResult {
  const rawMode = input.mode?.toString().trim() ?? '';

  if (!rawMode) {
    return {
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
      },
    };
  }

  if (!EXIT_TICKET_MODES.includes(rawMode as ExitTicketMode)) {
    return { success: false, message: 'Exit ticket type is invalid.' };
  }

  if (rawMode === 'basic') {
    return {
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
      },
    };
  }

  const option = exitTicketFocusOption(input.focus?.toString().trim());
  if (!option) {
    return {
      success: false,
      message: 'Choose what this exit ticket is checking for.',
    };
  }

  const topic = input.topic?.toString().trim() ?? '';
  if (!topic) {
    return {
      success: false,
      message: 'Tell students what this exit ticket is about.',
    };
  }
  if (topic.length > EXIT_TICKET_TOPIC_MAX_LENGTH) {
    return {
      success: false,
      message: `Keep the topic under ${EXIT_TICKET_TOPIC_MAX_LENGTH} characters.`,
    };
  }

  return {
    success: true,
    config: {
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific',
      focus: option.value,
      topic,
    },
  };
}

/**
 * Reading: null for anything that is not a config this version wrote. Every
 * assignment created before this column existed lands here, so an unreadable
 * value has to mean "not an exit ticket config" and never an error.
 */
export function parseStoredExitTicketConfig(
  value: unknown
): ExitTicketConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== EXIT_TICKET_CONFIG_SCHEMA_VERSION) return null;

  if (record.mode === 'basic') {
    return { schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION, mode: 'basic' };
  }

  if (record.mode !== 'specific') return null;

  const option = exitTicketFocusOption(
    typeof record.focus === 'string' ? record.focus : null
  );
  if (!option) return null;

  const topic = typeof record.topic === 'string' ? record.topic.trim() : '';
  if (!topic) return null;

  return {
    schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
    mode: 'specific',
    focus: option.value,
    topic,
  };
}
