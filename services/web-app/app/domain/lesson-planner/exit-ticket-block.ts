/**
 * The check for understanding a lesson ends on, offered as a real Exit Ticket
 * assignment rather than a page to photocopy.
 *
 * The planner already writes exit tickets — as printed material, in the packet
 * with the handouts. That is the right answer for a paper lesson and the wrong
 * one for a lesson taught in Yawp, where an exit ticket is an assignment type:
 * students write into it, and every response comes back read and scored
 * against what the teacher said they were checking for.
 *
 * A teacher who has just planned the lesson has already told the planner the
 * objective, what students must be able to say, and the mix-up they always
 * make — which is, field for field, what the exit ticket form asks. So the
 * planner hands the whole thing over: the block below carries the answers, and
 * the app puts a button under it that opens the creation sheet already filled
 * in. This is the Daily Pages seam (`daily-pages-block.ts`) applied to the
 * other end of the lesson.
 *
 * Everything is composed and validated through `~/domain/assignment-types/
 * exit-ticket`, never here, so a ticket the planner proposes and a ticket a
 * teacher builds by hand are the same object.
 */
import {
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  EXIT_TICKET_GRADING_BASES,
  EXIT_TICKET_MIN_SENTENCES_MAX,
  EXIT_TICKET_MIN_WORDS_MAX,
  composeExitTicketPrompt,
  exitTicketAnswerType,
  exitTicketFocusOption,
  parseExitTicketConfigInput,
  type ExitTicketAnswerType,
  type ExitTicketConfig,
  type ExitTicketFocus,
  type ExitTicketGrading,
  type ExitTicketLessonNotes,
  type ExitTicketMode,
  type ExitTicketReflectionPrompt,
} from '~/domain/assignment-types/exit-ticket';
import { FROM_LESSON_PARAM } from './daily-pages-block';

export const EXIT_TICKET_FENCE = 'yawp-exit-ticket';

const EXIT_TICKET_BLOCK = new RegExp(
  '```+' + EXIT_TICKET_FENCE + '[^\\n]*\\n([\\s\\S]*?)```+',
  'g'
);

/** `key: value`, one per line. Anything else in the block is ignored. */
const FIELD_LINE = /^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/;

/**
 * The field names the planner writes. Short and lesson-shaped rather than
 * form-shaped: `answer`, not `answerType`, because the model is writing what
 * the ticket is, not filling in a form's internals.
 */
type BlockFields = {
  kind?: string;
  mode?: string;
  prompt?: string;
  promptText?: string;
  graded?: string;
  points?: string;
  basis?: string;
  minWords?: string;
  minSentences?: string;
  assessFor?: string;
  focus?: string;
  topic?: string;
  answer?: string;
  mainPoints?: string;
  mustMention?: string;
  watchFor?: string;
};

const FIELD_ALIASES: Record<string, keyof BlockFields> = {
  kind: 'kind',
  mode: 'mode',
  prompt: 'prompt',
  question: 'prompt',
  prompttext: 'promptText',
  graded: 'graded',
  points: 'points',
  pointvalue: 'points',
  basis: 'basis',
  minwords: 'minWords',
  minsentences: 'minSentences',
  assessfor: 'assessFor',
  focus: 'focus',
  topic: 'topic',
  answer: 'answer',
  answertype: 'answer',
  mainpoints: 'mainPoints',
  mustmention: 'mustMention',
  watchfor: 'watchFor',
};

export type PlannedExitTicket = {
  config: ExitTicketConfig;
  /** The prompt exactly as students will read it, composed not written. */
  prompt: string;
  /** Whether it goes in the gradebook. Ungraded unless the block said so. */
  graded: boolean;
  /** Null when ungraded; the exit ticket default when graded without one. */
  pointValue: number | null;
};

const YES = new Set(['yes', 'true', 'graded', 'y', '1']);

/** The form calls bands "Quality"; the planner may say either. */
function blockBasis(value: string | undefined): string | undefined {
  const basis = value?.trim().toLowerCase();
  return basis === 'quality' ? 'bands' : basis;
}

function blockPoints(value: string | undefined): number | null {
  const points = Number(value?.trim());
  return Number.isInteger(points) && points >= 1 && points <= 1000
    ? points
    : null;
}

function readFields(raw: string): BlockFields {
  const fields: BlockFields = {};
  for (const line of raw.split('\n')) {
    const match = FIELD_LINE.exec(line);
    if (!match) continue;
    const key = FIELD_ALIASES[match[1]!.toLowerCase()];
    if (!key) continue;
    fields[key] = match[2]!.trim();
  }
  return fields;
}

/**
 * One block, or null when it does not describe a ticket that can be built.
 *
 * A half-filled block is dropped rather than repaired: a specific ticket with
 * no topic would compose into a sentence with a hole in it, and one with no
 * answer type would let a student be told they are wrong on a question that
 * never had a right answer.
 */
function readBlock(raw: string): PlannedExitTicket | null {
  const fields = readFields(raw);
  if (!fields.kind && !fields.mode && !fields.focus && !fields.topic) {
    return null;
  }

  const base = {
    // A kind is the quick builder's word for a mode. When both are present
    // and disagree the parser refuses, and so does this.
    kind: fields.kind,
    mode: fields.mode || (fields.kind ? undefined : 'basic'),
    focus: fields.focus,
    topic: fields.topic,
    answerType: fields.answer,
    reflectionPrompt: fields.prompt,
    reflectionPromptText: fields.promptText,
    lessonMainPoints: fields.mainPoints,
    lessonMustMention: fields.mustMention,
    lessonWatchFor: fields.watchFor,
  };
  const wantsGrade = YES.has(fields.graded?.trim().toLowerCase() ?? '');

  // Grading the block cannot back up is dropped, not the ticket: a check with
  // no answer key is still a good ticket to hand over, just not yet a graded
  // one, and the teacher can add the answer and grade it in the form.
  const graded = wantsGrade
    ? parseExitTicketConfigInput({
        ...base,
        graded: true,
        gradingBasis: blockBasis(fields.basis),
        minWords: fields.minWords,
        minSentences: fields.minSentences,
        assessFor: fields.assessFor,
      })
    : null;
  if (graded?.success) {
    return {
      config: graded.config,
      prompt: composeExitTicketPrompt(graded.config),
      graded: true,
      pointValue: blockPoints(fields.points) ?? EXIT_TICKET_DEFAULT_POINT_VALUE,
    };
  }

  const parsed = parseExitTicketConfigInput(base);
  if (!parsed.success) return null;

  return {
    config: parsed.config,
    prompt: composeExitTicketPrompt(parsed.config),
    graded: false,
    pointValue: null,
  };
}

/**
 * The exit tickets in a reply, and the reply without their blocks.
 */
export function readPlannedExitTickets(content: string): {
  tickets: PlannedExitTicket[];
  body: string;
} {
  const tickets: PlannedExitTicket[] = [];
  let body = content;

  for (const match of content.matchAll(EXIT_TICKET_BLOCK)) {
    body = body.replace(match[0], '');
    const ticket = readBlock(match[1] ?? '');
    if (ticket) tickets.push(ticket);
  }

  if (body === content) return { tickets, body: content };
  return { tickets, body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * The same reply with each ticket turned back into the words students read.
 *
 * On the packet page there is no assignment to create — the packet is a thing
 * to print — but the ticket is real lesson content, and printing the fence
 * would put a block of key-value pairs in the middle of a lesson plan.
 */
export function inlinePlannedExitTickets(content: string): string {
  return content.replace(EXIT_TICKET_BLOCK, (_match, raw: string) => {
    const ticket = readBlock(raw ?? '');
    if (!ticket) return '';
    return ticket.prompt
      .split('\n')
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n');
  });
}

/**
 * The search params that carry a planned ticket to the creation sheet. Named
 * for the form fields they fill so the two stay obviously connected.
 */
export const EXIT_TICKET_PARAMS = {
  mode: 'exitTicketMode',
  focus: 'exitTicketFocus',
  topic: 'exitTicketTopic',
  answerType: 'exitTicketAnswerType',
  mainPoints: 'exitTicketLessonMainPoints',
  mustMention: 'exitTicketLessonMustMention',
  watchFor: 'exitTicketLessonWatchFor',
  reflectionPrompt: 'exitTicketReflectionPrompt',
  reflectionPromptText: 'exitTicketReflectionPromptText',
  graded: 'exitTicketGraded',
  pointValue: 'exitTicketPointValue',
  gradingBasis: 'exitTicketGradingBasis',
  minWords: 'exitTicketMinWords',
  minSentences: 'exitTicketMinSentences',
  assessFor: 'exitTicketAssessFor',
} as const;

/**
 * Where the teacher lands when they accept the offer: their org's Exit Ticket
 * assignment type, with the creation sheet open on the answers the lesson
 * already decided. They still approve the wording before a class sees it —
 * the sheet previews the composed prompt exactly as it always does.
 */
export function exitTicketCreateHref(
  assignmentTypeId: string,
  ticket: PlannedExitTicket,
  conversationId?: string | null
): string {
  const { config } = ticket;
  const params = new URLSearchParams({
    [EXIT_TICKET_PARAMS.mode]: config.mode,
  });
  if (config.mode === 'specific') {
    params.set(EXIT_TICKET_PARAMS.focus, config.focus);
    params.set(EXIT_TICKET_PARAMS.topic, config.topic);
    params.set(EXIT_TICKET_PARAMS.answerType, config.answerType);
  }
  const notes = config.lessonNotes;
  if (notes?.mainPoints) {
    params.set(EXIT_TICKET_PARAMS.mainPoints, notes.mainPoints);
  }
  if (notes?.mustMention) {
    params.set(EXIT_TICKET_PARAMS.mustMention, notes.mustMention);
  }
  if (notes?.watchFor) {
    params.set(EXIT_TICKET_PARAMS.watchFor, notes.watchFor);
  }
  if (config.mode === 'basic' && config.reflectionPrompt) {
    params.set(EXIT_TICKET_PARAMS.reflectionPrompt, config.reflectionPrompt.id);
    if (config.reflectionPrompt.id === 'custom') {
      params.set(
        EXIT_TICKET_PARAMS.reflectionPromptText,
        config.reflectionPrompt.text
      );
    }
  }
  if (ticket.graded) {
    params.set(EXIT_TICKET_PARAMS.graded, 'true');
    if (ticket.pointValue) {
      params.set(EXIT_TICKET_PARAMS.pointValue, String(ticket.pointValue));
    }
    const grading = config.grading;
    if (grading) {
      params.set(EXIT_TICKET_PARAMS.gradingBasis, grading.basis);
      if (grading.minWords) {
        params.set(EXIT_TICKET_PARAMS.minWords, String(grading.minWords));
      }
      if (grading.minSentences) {
        params.set(
          EXIT_TICKET_PARAMS.minSentences,
          String(grading.minSentences)
        );
      }
      if (grading.assessFor) {
        params.set(EXIT_TICKET_PARAMS.assessFor, grading.assessFor);
      }
    }
  }
  if (conversationId) params.set(FROM_LESSON_PARAM, conversationId);
  return `/app/assignment-types/${assignmentTypeId}?${params}`;
}

export type ExitTicketPrefill = {
  mode: ExitTicketMode;
  focus: ExitTicketFocus | null;
  topic: string;
  /** Null leaves the question unanswered, which is what blocks submission. */
  answerType: ExitTicketAnswerType | null;
  lessonNotes: ExitTicketLessonNotes | null;
  /** Null for the default question. */
  reflectionPrompt: ExitTicketReflectionPrompt | null;
  graded: boolean;
  /** Null when absent or unreadable; the form then uses its own default. */
  pointValue: number | null;
  /** Null when absent or unreadable: the form opens on its defaults. */
  grading: ExitTicketGrading | null;
};

function prefillCount(value: string | null, max: number): number | undefined {
  const count = Number(value?.trim());
  return value && Number.isInteger(count) && count >= 1 && count <= max
    ? count
    : undefined;
}

function readPrefillReflectionPrompt(
  params: URLSearchParams
): ExitTicketReflectionPrompt | null {
  const id = params.get(EXIT_TICKET_PARAMS.reflectionPrompt)?.trim();
  if (id === 'interesting' || id === 'wondering') return { id };
  if (id === 'custom') {
    const text = params
      .get(EXIT_TICKET_PARAMS.reflectionPromptText)
      ?.trim()
      .replace(/\s+/g, ' ');
    return text ? { id: 'custom', text } : null;
  }
  return null;
}

function readPrefillGrading(params: URLSearchParams): ExitTicketGrading | null {
  const basis = params.get(EXIT_TICKET_PARAMS.gradingBasis)?.trim();
  if (
    !(EXIT_TICKET_GRADING_BASES as readonly (string | undefined)[]).includes(
      basis
    )
  ) {
    return null;
  }
  const minWords = prefillCount(
    params.get(EXIT_TICKET_PARAMS.minWords),
    EXIT_TICKET_MIN_WORDS_MAX
  );
  const minSentences = prefillCount(
    params.get(EXIT_TICKET_PARAMS.minSentences),
    EXIT_TICKET_MIN_SENTENCES_MAX
  );
  const assessFor = params.get(EXIT_TICKET_PARAMS.assessFor)?.trim() ?? '';
  return {
    basis: basis as ExitTicketGrading['basis'],
    ...(minWords ? { minWords } : {}),
    ...(minSentences ? { minSentences } : {}),
    ...(assessFor ? { assessFor } : {}),
  };
}

/**
 * What the assignment type page should open its sheet on, or null for an
 * ordinary visit.
 *
 * A URL is a thing a teacher can edit, so nothing here is trusted to be
 * meaningful: an unknown mode or focus produces no prefill at all rather than
 * a sheet opened on something nobody chose. A missing answer type is the one
 * absence that is kept, because unanswered is a real state of the form.
 */
export function readExitTicketPrefill(
  params: URLSearchParams
): ExitTicketPrefill | null {
  const mode = params.get(EXIT_TICKET_PARAMS.mode)?.trim();
  if (mode !== 'basic' && mode !== 'specific') return null;

  let focus: ExitTicketFocus | null = null;
  if (mode === 'specific') {
    const option = exitTicketFocusOption(
      params.get(EXIT_TICKET_PARAMS.focus)?.trim()
    );
    if (!option) return null;
    focus = option.value;
  }

  const notes: ExitTicketLessonNotes = {
    mainPoints: params.get(EXIT_TICKET_PARAMS.mainPoints)?.trim() ?? '',
    mustMention: params.get(EXIT_TICKET_PARAMS.mustMention)?.trim() ?? '',
    watchFor: params.get(EXIT_TICKET_PARAMS.watchFor)?.trim() ?? '',
  };
  const hasNotes = Object.values(notes).some((value) => value.length > 0);

  return {
    mode,
    focus,
    topic: params.get(EXIT_TICKET_PARAMS.topic)?.trim() ?? '',
    answerType: exitTicketAnswerType(
      params.get(EXIT_TICKET_PARAMS.answerType)?.trim()
    ),
    lessonNotes: hasNotes ? notes : null,
    reflectionPrompt:
      mode === 'basic' ? readPrefillReflectionPrompt(params) : null,
    graded: params.get(EXIT_TICKET_PARAMS.graded) === 'true',
    pointValue: blockPoints(
      params.get(EXIT_TICKET_PARAMS.pointValue) ?? undefined
    ),
    grading: readPrefillGrading(params),
  };
}
