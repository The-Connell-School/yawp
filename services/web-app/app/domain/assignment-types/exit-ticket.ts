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
 * How a teacher thinks about the choice. A reflection asks how the lesson
 * landed and has no answer to get wrong; a check asks for evidence of one
 * specific thing. Each maps onto exactly one stored mode, so the kind is a
 * name for the choice rather than a second switch that could disagree.
 */
export const EXIT_TICKET_KINDS = ['reflection', 'check'] as const;
export type ExitTicketKind = (typeof EXIT_TICKET_KINDS)[number];

/** The quick option: an ungraded reflection needs nothing but a title. */
export const DEFAULT_EXIT_TICKET_KIND: ExitTicketKind = 'reflection';

export type ExitTicketKindOption = {
  value: ExitTicketKind;
  label: string;
  /** One short line. The longer explanation sits behind a disclosure. */
  helperText: string;
};

export const EXIT_TICKET_KIND_OPTIONS: ExitTicketKindOption[] = [
  {
    value: 'reflection',
    label: 'Reflection',
    helperText: 'Open-ended: what landed, what stuck, what is still unclear.',
  },
  {
    value: 'check',
    label: 'Check for understanding',
    helperText: 'Ask for evidence of one specific thing from today.',
  },
];

const MODE_FOR_KIND: Record<ExitTicketKind, ExitTicketMode> = {
  reflection: 'basic',
  check: 'specific',
};

export function exitTicketModeForKind(kind: ExitTicketKind): ExitTicketMode {
  return MODE_FOR_KIND[kind];
}

export function exitTicketKindForMode(mode: ExitTicketMode): ExitTicketKind {
  return mode === 'specific' ? 'check' : 'reflection';
}

function parseExitTicketKind(
  value: string | null | undefined
): ExitTicketKind | null {
  return EXIT_TICKET_KINDS.includes(value as ExitTicketKind)
    ? (value as ExitTicketKind)
    : null;
}

/**
 * Long enough for "the difference between a theme and a topic", short
 * enough that the field cannot quietly become a second prompt box — the
 * composed sentence has to stay readable to a student.
 */
export const EXIT_TICKET_TOPIC_MAX_LENGTH = 200;

/**
 * An exit ticket checks what the student understands on their own. A tutor in
 * the document would be answering the question for them, so the per-assignment
 * tutor toggle starts off for this type where it starts on for every other.
 */
export const EXIT_TICKET_TUTOR_ENABLED_DEFAULT = false;

/**
 * An exit ticket is read to find out whether the lesson landed, so it starts
 * as a feedback-only check: the assistant still reads every response and
 * scores understanding, but nothing lands in the gradebook. A teacher who
 * wants points chooses them deliberately.
 */
export const EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT = false;

/**
 * What an exit ticket is worth when a teacher does grade it. Five minutes of
 * writing is not a hundred-point assignment, and the product default of 100
 * would quietly make one lesson check outweigh an essay.
 */
export const EXIT_TICKET_DEFAULT_POINT_VALUE = 10;

/** Notes, not lesson plans: long enough for a paragraph each. */
export const EXIT_TICKET_LESSON_NOTE_MAX_LENGTH = 1000;

/**
 * What the teacher can tell us about the lesson the ticket closes. Students
 * never see any of it — "what they absolutely should mention" is the answer
 * key — so none of it is composed into the prompt. It is stored beside the
 * ticket for whoever reads the responses.
 */
export type ExitTicketLessonNotes = {
  mainPoints: string;
  mustMention: string;
  watchFor: string;
};

export type ExitTicketLessonNoteField = {
  key: keyof ExitTicketLessonNotes;
  label: string;
  helperText: string;
  placeholder: string;
};

export const EXIT_TICKET_LESSON_NOTE_FIELDS: ExitTicketLessonNoteField[] = [
  {
    key: 'mainPoints',
    label: 'Main points of the lesson',
    helperText: 'What today was actually about, in a sentence or two.',
    placeholder:
      'e.g., A topic is what a book is about in a word \u2014 loneliness. A theme is what the book says about it: that loneliness makes people careless with each other.',
  },
  {
    key: 'mustMention',
    label: 'What they absolutely should mention',
    helperText:
      'The one thing a response cannot leave out and still show understanding.',
    placeholder:
      'e.g., That a theme has to make a claim, not just name a subject.',
  },
  {
    key: 'watchFor',
    label: 'Mix-ups to watch for',
    helperText: 'The wrong turn students usually take with this.',
    placeholder: 'e.g., Using “theme” and “topic” interchangeably.',
  },
];

/**
 * How pointed the reading of this ticket can be, given what the teacher has
 * told us. A vague exit ticket is a real choice and often a good one — it
 * catches what you did not think to ask about. But nothing can be judged
 * against a target that was never named, so this is stated plainly in the form
 * rather than left for a teacher to discover from disappointing results.
 */
export function exitTicketTargetingHint(
  lessonNotes: ExitTicketLessonNotes | null | undefined
): string {
  const filled = lessonNotes
    ? EXIT_TICKET_LESSON_NOTE_FIELDS.filter(
        (field) => lessonNotes[field.key].trim().length > 0
      ).length
    : 0;

  if (filled === 0) {
    return 'Nothing here yet. Responses will be read on their own terms — open-ended, and good for catching what you did not think to ask about.';
  }
  if (filled < EXIT_TICKET_LESSON_NOTE_FIELDS.length) {
    return 'Good. Every box you fill in gives the reading of these responses something more specific to look for.';
  }
  return 'All three filled in. This is as targeted as an exit ticket gets: responses can be read against what you actually taught.';
}

/**
 * Whether the lesson notes start open. A specific ticket already has the
 * teacher naming what they are checking, so asking what the lesson covered is
 * the natural next question. A basic ticket is meant to be one click.
 */
export function defaultExitTicketLessonNotesEnabled(
  mode: ExitTicketMode
): boolean {
  return mode === 'specific';
}

/**
 * Whether the thing being checked for has a right answer.
 *
 * The teacher has to answer this, because the grader cannot infer it from a
 * topic and the cost of guessing wrong falls on the student: told they are
 * incorrect for a reading that was defensible all along. There is no default
 * on the form for the same reason.
 */
export const EXIT_TICKET_ANSWER_TYPES = ['objective', 'subjective'] as const;

export type ExitTicketAnswerType = (typeof EXIT_TICKET_ANSWER_TYPES)[number];

/**
 * What a stored ticket means when it never answered the question. Only rows
 * written before this field existed land here, and they read as subjective:
 * a ticket that never claimed a right answer must not be graded as though it
 * had one.
 */
export const EXIT_TICKET_ANSWER_TYPE_FALLBACK: ExitTicketAnswerType =
  'subjective';

export type ExitTicketAnswerTypeOption = {
  value: ExitTicketAnswerType;
  label: string;
  helperText: string;
};

export const EXIT_TICKET_ANSWER_TYPE_OPTIONS: ExitTicketAnswerTypeOption[] = [
  {
    value: 'objective',
    label: 'Yes — there is a right answer',
    helperText:
      'A response that contradicts it is wrong, and will be told so plainly.',
  },
  {
    value: 'subjective',
    label: 'No — more than one answer can be right',
    helperText:
      'Judged on the reasoning and what it is anchored to, never on landing where you would have. A defensible answer you did not expect is still a good answer.',
  },
];

export function exitTicketAnswerType(
  value: string | null | undefined
): ExitTicketAnswerType | null {
  return EXIT_TICKET_ANSWER_TYPES.includes(value as ExitTicketAnswerType)
    ? (value as ExitTicketAnswerType)
    : null;
}

/**
 * Kept deliberately short. Six focuses made the teacher choose between options
 * that overlapped, and an exit ticket is a five-minute check — the choice has
 * to be quicker than writing the prompt would have been.
 */
export type ExitTicketFocus =
  | 'explain-concept'
  | 'ask-question'
  | 'understand-text';

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
  /**
   * How the grader should read the rubric bands for this focus. The bands are
   * the shared spine — explains it, partly there, names it only, no evidence —
   * and this says what each one means when the ticket is checking for this
   * particular kind of understanding. Never shown to the student.
   */
  gradingCriteria: string;
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
    topicPlaceholder: 'e.g., how to work a quotation into your own sentence',
    template:
      'In your own words, explain {topic}. Write it the way you would explain it to someone who missed class today — not the definition you were given, but what you actually understand it to mean.',
    gradingCriteria:
      'Judge whether the student can restate the idea in their own words and whether their explanation would genuinely help someone who missed the lesson. Fluent phrasing borrowed from the teacher or the textbook, with nothing showing the student has made the idea theirs, is names it only however polished it sounds.',
  },
  {
    value: 'ask-question',
    label: 'Ask a question',
    helperText:
      'What do they still want to know? A good question shows what they already have.',
    topicPlaceholder: 'e.g., semicolons',
    template:
      'What is one question you still have about {topic}? Ask the real one — the thing you would actually want answered — and say what you have already worked out that led you to it.',
    gradingCriteria:
      'The student was asked for a question, so not knowing something is the task here and never a failure. Judge what the question reveals rather than whether they were confident: a question that could only be asked by someone who followed the lesson is strong evidence of understanding, and one that could have been asked before the lesson began is weak evidence of it. Look for what they say they had already worked out. Never score a response down for admitting they do not know something.',
  },
  {
    value: 'understand-text',
    label: 'Understand a text or source',
    helperText: 'Did they read it closely, or just get the gist?',
    topicPlaceholder: 'e.g., the second stanza of the poem',
    template:
      'What is {topic} actually saying? Put it in your own words, then point to what in it made you read it that way.',
    gradingCriteria:
      'Judge whether the reading is the student’s own and whether it is anchored to the source. Look for both: a restatement in their own words, and them pointing at what in the text produced that reading. A plausible summary with nothing pointed at is partly there.',
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

/**
 * The reflection prompts a teacher can pick from, plus their own. A short list
 * on purpose: a reflection should take seconds to set up, and the choice has
 * to be quicker than writing the prompt would have been.
 */
export const EXIT_TICKET_REFLECTION_PROMPT_IDS = [
  'learned',
  'interesting',
  'wondering',
  'custom',
] as const;
export type ExitTicketReflectionPromptId =
  (typeof EXIT_TICKET_REFLECTION_PROMPT_IDS)[number];

export const DEFAULT_EXIT_TICKET_REFLECTION_PROMPT: ExitTicketReflectionPromptId =
  'learned';

/** A question, not an essay prompt: long enough for two sentences. */
export const EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH = 300;

export type ExitTicketReflectionPromptOption = {
  id: ExitTicketReflectionPromptId;
  label: string;
  /** What students read. Absent only for the teacher's own prompt. */
  prompt?: string;
  /**
   * How the grader should read the shared bands for this prompt. Absent for
   * the default, which is read against the prompt alone, as it always was.
   */
  gradingCriteria?: string;
};

export type ExitTicketReflectionPrompt =
  | { id: 'interesting' | 'wondering' }
  | { id: 'custom'; text: string };

export const EXIT_TICKET_REFLECTION_PROMPT_OPTIONS: ExitTicketReflectionPromptOption[] =
  [
    {
      id: 'learned',
      label: 'What I learned',
      prompt: BASIC_EXIT_TICKET_PROMPT,
    },
    {
      id: 'interesting',
      label: 'Most interesting',
      prompt:
        'What was the most interesting thing from today’s lesson? Explain what it was and why it stuck with you.',
      gradingCriteria:
        'The student was asked what they found most interesting, so there is no right answer to reach. Judge whether they name something specific from the lesson and explain it well enough to show they understood it — a vague "it was all interesting" is names it only. Why it interested them matters less than whether their account of it is accurate and their own.',
    },
    {
      id: 'wondering',
      label: 'Still wondering',
      prompt:
        'What is one question you still have about today’s lesson? Ask the real one — the thing you would actually want answered — and say what you have already worked out that led you to it.',
    },
    {
      id: 'custom',
      label: 'Write your own',
    },
  ];

/**
 * What a graded ticket is graded on. A reflection can be graded for
 * completion — the quick-feedback case, and the common one — or on the quality
 * of the reflection. A check is always read in bands: it exists to find out
 * whether one specific thing landed.
 *
 * Bands, never steps: the rubric is one category with four bands, and a
 * five-minute piece of writing does not have enough in it to step through.
 */
export const EXIT_TICKET_GRADING_BASES = ['completion', 'bands'] as const;
export type ExitTicketGradingBasis = (typeof EXIT_TICKET_GRADING_BASES)[number];

export const EXIT_TICKET_GRADING_BASIS_OPTIONS: {
  value: ExitTicketGradingBasis;
  label: string;
  helperText: string;
}[] = [
  {
    value: 'completion',
    label: 'Completion',
    helperText: 'Full credit for any honest attempt.',
  },
  {
    value: 'bands',
    label: 'Quality',
    helperText: 'Scored on how well they explain it.',
  },
];

/** What the builder opens on when a teacher turns grading on. */
export const DEFAULT_EXIT_TICKET_GRADING_BASIS: ExitTicketGradingBasis =
  'completion';

export const EXIT_TICKET_MIN_WORDS_MAX = 500;
export const EXIT_TICKET_MIN_SENTENCES_MAX = 20;
export const EXIT_TICKET_ASSESS_FOR_MAX_LENGTH = 300;

/**
 * What the teacher said a graded ticket is graded on. Stored only on a graded
 * ticket; an ungraded one is read for feedback against the prompt and notes.
 */
export type ExitTicketGrading = {
  basis: ExitTicketGradingBasis;
  /** A floor, not a target: short answers cap out, long ones earn nothing. */
  minWords?: number;
  minSentences?: number;
  /** What to judge when there is no single right answer. */
  assessFor?: string;
};

/**
 * The lesson notes a graded ticket asks for as grading criteria, in the order
 * the builder shows them. The same keys are stored as lesson notes either way,
 * so a criterion typed here and a note typed in "More options" are one field.
 */
export function exitTicketCriteriaNoteKeys({
  kind,
  graded,
  answerType,
  basis,
}: {
  kind: ExitTicketKind;
  graded: boolean;
  answerType: string;
  basis: ExitTicketGradingBasis;
}): (keyof ExitTicketLessonNotes)[] {
  if (!graded) return [];
  if (kind === 'reflection') return basis === 'bands' ? ['mainPoints'] : [];
  return answerType === 'objective' ? ['mustMention', 'watchFor'] : [];
}

type ExitTicketConfigBase = {
  schemaVersion: typeof EXIT_TICKET_CONFIG_SCHEMA_VERSION;
  /** Absent, never empty: a ticket without notes stores no key at all. */
  lessonNotes?: ExitTicketLessonNotes;
  /** Present only on a ticket the teacher chose to grade. */
  grading?: ExitTicketGrading;
};

export type ExitTicketConfig =
  | (ExitTicketConfigBase & {
      mode: 'basic';
      /** Written by the new builder only; derived from `mode` otherwise. */
      kind?: 'reflection';
      /** Absent means the original basic prompt ("what I learned"). */
      reflectionPrompt?: ExitTicketReflectionPrompt;
    })
  | (ExitTicketConfigBase & {
      mode: 'specific';
      kind?: 'check';
      focus: ExitTicketFocus;
      topic: string;
      answerType: ExitTicketAnswerType;
    });

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

/** Which kind a ticket is, for rows written before the kind was stored too. */
export function exitTicketKind(config: ExitTicketConfig): ExitTicketKind {
  return config.kind ?? exitTicketKindForMode(config.mode);
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

type GradingParseResult =
  | { success: true; grading?: ExitTicketGrading }
  | { success: false; message: string };

/** A blank field is no expectation; anything else must be a sane count. */
function parseMinimum(
  value: string | number | null | undefined,
  max: number,
  noun: string
): { success: true; value?: number } | { success: false; message: string } {
  const raw = value?.toString().trim() ?? '';
  if (!raw) return { success: true };
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > max) {
    return {
      success: false,
      message: `Minimum ${noun} must be a whole number from 1 to ${max}.`,
    };
  }
  return { success: true, value: count };
}

/**
 * A graded ticket has to say what it is graded against. A general prompt read
 * with nothing to hold it to cannot support a points-based grade, so the
 * criteria each shape needs are required here rather than hoped for.
 */
function parseGradingInput(
  input: ExitTicketConfigInput,
  kind: ExitTicketKind,
  answerType: ExitTicketAnswerType | null,
  lessonNotes: ExitTicketLessonNotes | undefined
): GradingParseResult {
  if (input.graded !== true) return { success: true };

  const minWords = parseMinimum(
    input.minWords,
    EXIT_TICKET_MIN_WORDS_MAX,
    'words'
  );
  if (!minWords.success) return minWords;
  const minSentences = parseMinimum(
    input.minSentences,
    EXIT_TICKET_MIN_SENTENCES_MAX,
    'sentences'
  );
  if (!minSentences.success) return minSentences;
  const hasLength =
    minWords.value !== undefined || minSentences.value !== undefined;

  const assessFor =
    input.assessFor?.toString().trim().replace(/\s+/g, ' ') ?? '';
  if (assessFor.length > EXIT_TICKET_ASSESS_FOR_MAX_LENGTH) {
    return {
      success: false,
      message: `Keep “what to assess” under ${EXIT_TICKET_ASSESS_FOR_MAX_LENGTH} characters.`,
    };
  }

  let basis: ExitTicketGradingBasis = 'bands';
  if (kind === 'reflection') {
    const posted = input.gradingBasis?.toString().trim() ?? '';
    if (!(EXIT_TICKET_GRADING_BASES as readonly string[]).includes(posted)) {
      return {
        success: false,
        message: 'Choose how this reflection is graded.',
      };
    }
    basis = posted as ExitTicketGradingBasis;
    if (basis === 'bands' && !lessonNotes?.mainPoints && !hasLength) {
      return {
        success: false,
        message:
          'Add the main points of the lesson or a minimum length, so there is something to grade against.',
      };
    }
  } else if (answerType === 'objective') {
    if (!lessonNotes?.mustMention) {
      return {
        success: false,
        message: 'Add the correct answer so this can be graded.',
      };
    }
  } else if (!assessFor && !hasLength) {
    return {
      success: false,
      message: 'Say what to assess, since there is no single right answer.',
    };
  }

  return {
    success: true,
    grading: {
      basis,
      ...(minWords.value !== undefined ? { minWords: minWords.value } : {}),
      ...(minSentences.value !== undefined
        ? { minSentences: minSentences.value }
        : {}),
      ...(assessFor && kind === 'check' && answerType !== 'objective'
        ? { assessFor }
        : {}),
    },
  };
}

/** Stored as written where it can be read; unreadable parts are dropped. */
function parseStoredGrading(value: unknown): ExitTicketGrading | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !(EXIT_TICKET_GRADING_BASES as readonly unknown[]).includes(record.basis)
  ) {
    return null;
  }
  const count = (entry: unknown, max: number) =>
    typeof entry === 'number' &&
    Number.isInteger(entry) &&
    entry >= 1 &&
    entry <= max
      ? entry
      : undefined;
  const minWords = count(record.minWords, EXIT_TICKET_MIN_WORDS_MAX);
  const minSentences = count(
    record.minSentences,
    EXIT_TICKET_MIN_SENTENCES_MAX
  );
  const assessFor =
    typeof record.assessFor === 'string' ? record.assessFor.trim() : '';
  return {
    basis: record.basis as ExitTicketGradingBasis,
    ...(minWords !== undefined ? { minWords } : {}),
    ...(minSentences !== undefined ? { minSentences } : {}),
    ...(assessFor ? { assessFor } : {}),
  };
}

/** Whitespace tidied, wording untouched: this is the teacher's sentence. */
function normalizePromptText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

type ReflectionPromptParseResult =
  | { success: true; reflectionPrompt?: ExitTicketReflectionPrompt }
  | { success: false; message: string };

function parseReflectionPromptInput(
  input: ExitTicketConfigInput
): ReflectionPromptParseResult {
  const id = input.reflectionPrompt?.toString().trim() ?? '';
  if (!id || id === 'learned') return { success: true };

  if (!(EXIT_TICKET_REFLECTION_PROMPT_IDS as readonly string[]).includes(id)) {
    return { success: false, message: 'Choose a reflection prompt.' };
  }
  if (id !== 'custom') {
    return {
      success: true,
      reflectionPrompt: { id: id as 'interesting' | 'wondering' },
    };
  }

  const text = normalizePromptText(
    input.reflectionPromptText?.toString() ?? ''
  );
  if (!text) {
    return {
      success: false,
      message: 'Write the question students will answer.',
    };
  }
  if (text.length > EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH) {
    return {
      success: false,
      message: `Keep your question under ${EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH} characters.`,
    };
  }
  return { success: true, reflectionPrompt: { id: 'custom', text } };
}

/** Stored as written, or nothing: an unreadable value is the default prompt. */
function parseStoredReflectionPrompt(
  value: unknown
): ExitTicketReflectionPrompt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.id === 'interesting' || record.id === 'wondering') {
    return { id: record.id };
  }
  if (record.id === 'custom' && typeof record.text === 'string') {
    const text = normalizePromptText(record.text);
    return text ? { id: 'custom', text } : null;
  }
  return null;
}

/** Which reflection prompt a ticket asks; the default for everything else. */
export function exitTicketReflectionPromptId(
  config: ExitTicketConfig
): ExitTicketReflectionPromptId {
  if (config.mode !== 'basic') return DEFAULT_EXIT_TICKET_REFLECTION_PROMPT;
  return config.reflectionPrompt?.id ?? DEFAULT_EXIT_TICKET_REFLECTION_PROMPT;
}

export function exitTicketReflectionPromptOption(
  id: string | null | undefined
): ExitTicketReflectionPromptOption | null {
  return (
    EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.find((option) => option.id === id) ??
    null
  );
}

/** The words a reflection asks, before the elaboration note. */
function reflectionPromptText(config: ExitTicketConfig): string {
  if (config.mode !== 'basic' || !config.reflectionPrompt) {
    return BASIC_EXIT_TICKET_PROMPT;
  }
  if (config.reflectionPrompt.id === 'custom') {
    return config.reflectionPrompt.text;
  }
  return (
    exitTicketReflectionPromptOption(config.reflectionPrompt.id)?.prompt ??
    BASIC_EXIT_TICKET_PROMPT
  );
}

/** The prompt the student actually sees. */
export function composeExitTicketPrompt(config: ExitTicketConfig): string {
  if (config.mode === 'basic') {
    return `${reflectionPromptText(config)}\n\n${EXIT_TICKET_ELABORATION_NOTE}`;
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
  /** Posted by the new builder. Absent from every v1 client. */
  kind?: string | null;
  mode?: string | null;
  /** Reflection only. Absent or 'learned' stores nothing. */
  reflectionPrompt?: string | null;
  reflectionPromptText?: string | null;
  /**
   * Whether the teacher is grading this ticket. Only the quick builder says;
   * absent means "not asked", and nothing below is checked or stored.
   */
  graded?: boolean | null;
  gradingBasis?: string | null;
  minWords?: string | number | null;
  minSentences?: string | number | null;
  assessFor?: string | null;
  focus?: string | null;
  topic?: string | null;
  answerType?: string | null;
  lessonMainPoints?: string | null;
  lessonMustMention?: string | null;
  lessonWatchFor?: string | null;
};

type LessonNotesParseResult =
  | { success: true; lessonNotes?: ExitTicketLessonNotes }
  | { success: false; message: string };

function parseLessonNotesInput(
  input: ExitTicketConfigInput
): LessonNotesParseResult {
  const notes: ExitTicketLessonNotes = {
    mainPoints: input.lessonMainPoints?.toString().trim() ?? '',
    mustMention: input.lessonMustMention?.toString().trim() ?? '',
    watchFor: input.lessonWatchFor?.toString().trim() ?? '',
  };

  for (const field of EXIT_TICKET_LESSON_NOTE_FIELDS) {
    if (notes[field.key].length > EXIT_TICKET_LESSON_NOTE_MAX_LENGTH) {
      return {
        success: false,
        message: `Keep “${field.label}” under ${EXIT_TICKET_LESSON_NOTE_MAX_LENGTH} characters.`,
      };
    }
  }

  const hasAny = Object.values(notes).some((value) => value.length > 0);
  return hasAny ? { success: true, lessonNotes: notes } : { success: true };
}

function withLessonNotes<T extends ExitTicketConfig>(
  config: T,
  parsed: { lessonNotes?: ExitTicketLessonNotes }
): T {
  return parsed.lessonNotes
    ? { ...config, lessonNotes: parsed.lessonNotes }
    : config;
}

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
  const rawKind = input.kind?.toString().trim() ?? '';
  const postedMode = input.mode?.toString().trim() ?? '';

  if (postedMode && !EXIT_TICKET_MODES.includes(postedMode as ExitTicketMode)) {
    return { success: false, message: 'Exit ticket type is invalid.' };
  }

  // A kind names the same choice as a mode. The new builder posts both; if
  // they ever disagree, the form sent something nobody chose.
  const kind = rawKind ? parseExitTicketKind(rawKind) : null;
  if (rawKind && !kind) {
    return { success: false, message: 'Exit ticket type is invalid.' };
  }
  if (kind && postedMode && exitTicketModeForKind(kind) !== postedMode) {
    return { success: false, message: 'Exit ticket type is invalid.' };
  }
  const rawMode = kind ? exitTicketModeForKind(kind) : postedMode;

  const notes = parseLessonNotesInput(input);
  if (!notes.success) return notes;

  if (!rawMode || rawMode === 'basic') {
    const reflection = parseReflectionPromptInput(input);
    if (!reflection.success) return reflection;
    const grading = parseGradingInput(
      input,
      'reflection',
      null,
      notes.lessonNotes
    );
    if (!grading.success) return grading;
    return {
      success: true,
      config: withLessonNotes(
        {
          schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
          mode: 'basic',
          ...(kind ? { kind: 'reflection' as const } : {}),
          ...(reflection.reflectionPrompt
            ? { reflectionPrompt: reflection.reflectionPrompt }
            : {}),
          ...(grading.grading ? { grading: grading.grading } : {}),
        },
        notes
      ),
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

  const answerType = exitTicketAnswerType(input.answerType?.toString().trim());
  if (!answerType) {
    return {
      success: false,
      message: 'Say whether there is a desired response.',
    };
  }

  const grading = parseGradingInput(
    input,
    'check',
    answerType,
    notes.lessonNotes
  );
  if (!grading.success) return grading;

  return {
    success: true,
    config: withLessonNotes(
      {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        ...(kind ? { kind: 'check' as const } : {}),
        focus: option.value,
        topic,
        answerType,
        ...(grading.grading ? { grading: grading.grading } : {}),
      },
      notes
    ),
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

  const notes = parseStoredLessonNotes(record.lessonNotes);
  // Mode is the source of truth. A kind is kept only when it agrees, so a
  // stored row can never read as a reflection and a check at once.
  const storedKind = parseExitTicketKind(
    typeof record.kind === 'string' ? record.kind : null
  );
  const storedGrading = parseStoredGrading(record.grading);
  const gradingField = storedGrading ? { grading: storedGrading } : {};

  if (record.mode === 'basic') {
    const reflectionPrompt = parseStoredReflectionPrompt(
      record.reflectionPrompt
    );
    return withLessonNotes(
      {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
        ...(storedKind === 'reflection' ? { kind: storedKind } : {}),
        ...(reflectionPrompt ? { reflectionPrompt } : {}),
        ...gradingField,
      },
      notes
    );
  }

  if (record.mode !== 'specific') return null;

  const option = exitTicketFocusOption(
    typeof record.focus === 'string' ? record.focus : null
  );
  if (!option) return null;

  const topic = typeof record.topic === 'string' ? record.topic.trim() : '';
  if (!topic) return null;

  return withLessonNotes(
    {
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific',
      ...(storedKind === 'check' ? { kind: storedKind } : {}),
      focus: option.value,
      topic,
      answerType:
        exitTicketAnswerType(
          typeof record.answerType === 'string' ? record.answerType : null
        ) ?? EXIT_TICKET_ANSWER_TYPE_FALLBACK,
      ...gradingField,
    },
    notes
  );
}

/**
 * Notes as stored. A value that is not the shape this version writes reads as
 * no notes rather than an error, so the ticket itself still opens.
 */
function parseStoredLessonNotes(value: unknown): {
  lessonNotes?: ExitTicketLessonNotes;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const read = (key: keyof ExitTicketLessonNotes) =>
    typeof record[key] === 'string' ? (record[key] as string).trim() : '';
  const notes: ExitTicketLessonNotes = {
    mainPoints: read('mainPoints'),
    mustMention: read('mustMention'),
    watchFor: read('watchFor'),
  };
  const hasAny = Object.values(notes).some((entry) => entry.length > 0);
  return hasAny ? { lessonNotes: notes } : {};
}
