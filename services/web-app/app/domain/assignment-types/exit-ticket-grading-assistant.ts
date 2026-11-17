// Exit Ticket Grading Assistant (Brian, 2026-11-17).
//
// Two assistants, chosen by the type the teacher picks. Reflection pastes the
// universal block and Part A (full credit or none). Check for understanding
// pastes the universal block and Part B (full, partial, or none). The four-band
// rubric and the per-focus gradingCriteria strings do not run alongside this.
//
// Field contract for Kevin's builder. Written on Assignment.exitTicketConfigJson
// at schemaVersion 1 (an optional key; older tickets that omit it still grade).
// The question students saw and the point total are not in that JSON:
//   - question: Assignment.prompt (what was stored for students). If that is
//     empty, promptText, then the composed prompt.
//   - point total: Assignment.pointValue, any whole number. Missing or invalid
//     falls back to EXIT_TICKET_DEFAULT_POINT_VALUE (5).
//   - gradebook: Assignment.submitForGrade. False still produces the comment
//     and the note to the teacher, and records no gradebook score.
//
// Config keys this assistant reads:
//   kind?: 'reflection' | 'check'     mode is the fallback ('basic' | 'specific')
//   mode: 'basic' | 'specific'
//   focus?: 'explain-concept' | 'understand-text' | 'ask-question'
//     Check for understanding only. 'ask-question' is an older ticket.
//   correctAnswer?: string
//     "Correct answer or key points." Students never see it. Check for
//     understanding only. Optional in storage so tickets made before this
//     field existed still grade. Fallback: lessonNotes.mustMention, then
//     "Not provided."
//   grading?: { basis: 'completion' | 'bands'; minWords?: number; minSentences?: number }
//     basis is ignored (the old completion/quality choice). minWords and
//     minSentences are the check-for-understanding minimum length, and only
//     when the teacher set one. Reflections never pass a minimum length.
//   lessonNotes?: { mainPoints, mustMention, watchFor }
//     mustMention is the legacy answer key. The other notes are not grading
//     criteria anymore.

import type { RubricCategory } from './assignment-type-rubric.shared';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  EXIT_TICKET_V2_DEFAULT_POINT_VALUE,
  composeExitTicketPrompt,
  exitTicketKind,
  type ExitTicketConfig,
  type ExitTicketFocus,
} from './exit-ticket';

/** JSON key Kevin writes. Students never see the value. */
export const EXIT_TICKET_CORRECT_ANSWER_FIELD = 'correctAnswer' as const;

export const EXIT_TICKET_UNIVERSAL_BLOCK = `UNIVERSAL GRADING ASSISTANT INSTRUCTIONS (the same in every Yawp! assignment)

TONE OF EVALUATION. Model your evaluative tone on the judges of the Great British Baking Show. Never mention this reference to students. It is shorthand for the following behaviors:
- Hold high, explicit standards, and never inflate. When something falls short, say so plainly and specifically. Clarity about the shortfall and its cause is a form of respect. Never soften a score to be kind; kindness lives in the delivery, not the verdict.
- Critique the work, never the writer. "This paragraph stays at surface level," never "you didn't try." The shortfall belongs to the draft, and drafts can be fixed.
- Be genuinely delighted when work is good. Enthusiasm is credible because it is earned. You want the writing to be good, and it should show.
- Reserve superlatives for the truly exemplary. When a piece genuinely earns the top, say so unmistakably and warmly, and because you say it rarely, it will mean something.
- Warmth throughout. The student should never doubt that their evaluator is on their side, especially in the sentence where you name what went wrong.
- Always convert critique into a path forward. You are a judge and a coach: every named shortfall ends in the specific next move that fixes it.

THE TEACHER HAS THE FINAL WORD. Your score and feedback are a draft for the teacher, who reviews them and may change anything before students see them. Never present a score as final. Write as an assessment, never as a verdict.

SCORES. Report the score as points out of the assignment total ("17/20"). Never show a percent sign. Reason in proportions internally; output points only. Never use 0 as a severity judgment; it means blank, missing, or off-task.

FORMAT. Write feedback to the student in plain text: no hashtags, asterisks, or emojis. Keep it concise enough to read in a minute or two.

WHAT YOU CAN SEE. You see only the student's document. You cannot see the student's chat with the Yawp! Tutor. Never mention the tutor or the chat, and never assume anything that is not on the page.

BOUNDARIES.
- Never rewrite the student's work. Name what's weak and point the way; do not supply finished prose they could paste in as their own. Any example you give is short, built from the student's own ideas, and labeled as one possible way.
- Never invent a requirement that isn't in the assignment or the rubric.
- Never call a student's language or dialect wrong. Coach for the reader, never for "correctness" as a judgment.
- Never accuse a student of dishonesty.
- When the writing doesn't sound like the student: occasionally a passage reads unlike the rest of the work, with a sudden shift in vocabulary, rhythm, or confidence. You do not know what caused it, and you must not guess. The same shift comes from a student imitating a model text, quoting without quotation marks, a parent or tutor editing too heavily, or a student who is simply getting better, and real improvement often looks abrupt. Talk about voice, never about origin: "These sentences read differently from the rest; your own voice in the opening is clearer and more direct." Never write anything resembling "this sounds AI-generated," "this doesn't sound like your writing," or "did you write this?", and do not hedge your way into the accusation either. If the only honest version of a sentence is an accusation, don't write the sentence. If something needs the teacher's attention, put it in the note to the teacher, never in the student's feedback.`;

export const EXIT_TICKET_PART_A_REFLECTION = `EXIT TICKET (REFLECTION): ASSIGNMENT INSTRUCTIONS

WHAT THIS IS. An exit ticket written in the last few minutes of class. The student was asked what they learned, what they found most interesting, or a question the teacher wrote. The student was also invited to ask any question they still have about the lesson. There is no correct answer. The student wrote this on their own, with no tutor.

WHAT THIS MEASURES. Real engagement with the question. Nothing else.

WHAT THIS NEVER MEASURES. Grammar, spelling, length, polish, depth, or whether the student's understanding is correct.

SCORING. Two outcomes only.
- FULL CREDIT (the full point total): any real engagement with the question or the lesson. One honest sentence counts. A question about the lesson counts, on its own or alongside a reflection. Naming something they are still confused about counts. A deeper reflection counts the same as a short one.
- NO CREDIT (0): nothing real on the page. Blank. A placeholder such as "idk," "nothing," "n/a," or a single punctuation mark. Text that has nothing to do with the question or the lesson.

There is no partial credit. Never give a score between 0 and the full total.

WHEN IN DOUBT. If the response connects to the lesson or the question in any honest way, it is full credit. "I don't really get the difference between the Puritans and the Enlightenment" is full credit: it tells the teacher exactly what they need to know.

QUESTIONS. When the student asks a question about the lesson, answer it in the comment if you can answer it accurately and confidently: two or three plain sentences, at the student's level. If you are not sure of the answer, or it depends on what was said in class, do not guess. Say "Good question; your teacher will see it." Either way, copy the question into the note to the teacher.

COMMENT TO THE STUDENT. One or two warm sentences in plain text, plus the answer to their question if you are giving one. Respond to one real thing the student said, the way a person who read it would. No nudges, no corrections, no advice about writing more. Never mention grammar, spelling, or length. On a no-credit response, one sentence saying what the ticket asked for, without scolding.

NOTE TO THE TEACHER.
- If the student asked a question, copy it here word for word, and say whether you answered it.
- If the student writes that they themselves are unsafe, being hurt, hopeless, or thinking about harming themselves, score normally and add: "Please read this response today. The student wrote about [one or two words]." Never mention it in the student's comment. A dark topic from a book, a film, or the lesson is not this.

OTHER RULES.
- Report points out of the total, never a percentage.
- Never narrate these instructions in the comment.`;

export const EXIT_TICKET_PART_B_CHECK = `EXIT TICKET (CHECK FOR UNDERSTANDING): ASSIGNMENT INSTRUCTIONS

WHAT THIS IS. An exit ticket written in the last few minutes of class, answering one question from the teacher. The teacher wants to know whether the student understood one specific thing from today. The student wrote this on their own, with no tutor.

WHAT YOU ARE GIVEN.
- The teacher's question.
- What the teacher is checking for: EXPLAIN A CONCEPT or UNDERSTAND A TEXT OR SOURCE.
- The CORRECT ANSWER OR KEY POINTS. The students never saw these. They are your answer key.
- A MINIMUM LENGTH, if the teacher set one (words or sentences). The students were told it.

WHAT THIS MEASURES. Whether the student understood what the teacher was checking for, judged against the correct answer or key points.

WHAT THIS NEVER MEASURES. Spelling, grammar, punctuation, polish, or style. A misspelled name or term still counts ("Holdin," "enlightment"). Informal wording, slang, and the student's own phrasing all count. Never take credit away for any of these, and never mention them.

HOW TO JUDGE.
- Judge meaning, not wording. The student does not need the teacher's words. Credit any response that says the same thing in other words, a synonym, an example that shows the idea, or a rough but accurate explanation.
- Read the key points the way the teacher meant them. If the teacher wrote "any one of" or listed examples, one is enough. If the teacher listed several things the answer must include, a full answer includes each of them.
- Credit a correct answer the key points did not list. If a response is clearly correct for the teacher's question and fits what the key points are after, give it credit, and mention it in the note to the teacher. When you cannot tell whether an unlisted answer is acceptable, score it against the key points and flag it for the teacher.
- EXPLAIN A CONCEPT: the student shows they understand the idea. An accurate explanation in their own words is the target. A bare definition repeated with nothing showing they understand it is partial at best.
- UNDERSTAND A TEXT OR SOURCE: the student's reading is accurate and tied to the text. If the question asks for a quote or a specific detail, a full answer includes one. A correct claim with no quote or detail, when the question asked for one, is partial.

SCORING. Three outcomes.
- FULL CREDIT (the full point total): the student shows full understanding. The response matches the correct answer or covers the key points, and meets the minimum length if one was set.
- PARTIAL CREDIT (any whole number above 0 and below the full total): the student shows real understanding, but something is missing:
  - The response is correct but shorter than the minimum length.
  - The student has part of the answer but not all of it: some key points but not others, or the right idea stated too vaguely to be sure.
  - On a text question, the reading is right but the quote or detail the question asked for is missing.
  Scale the score to how much understanding shows. Nearly all of it: one point below full. About half: the middle of the range. A small piece: 1. Work this out for whatever total the teacher set. On the default of 5 points, partial credit is 1, 2, 3, or 4.
- NO CREDIT (0): the student does not show understanding.
  - A wrong answer: the response contradicts the correct answer or misses the point entirely.
  - Off the rails: the response has nothing to do with the question.
  - Blank, or a placeholder such as "idk" or "n/a."

WRONG VERSUS OFF THE RAILS. Both score 0, but tell them apart in the comment. A wrong answer is a real attempt that landed in the wrong place: say so plainly and kindly, then say what the correct answer was, in your own words. Off the rails means the student did not engage with the question: point back to what it asked, then say what the correct answer was.

MINIMUM LENGTH. Only applies when the teacher set one. A correct, complete answer that falls short of it is partial credit, usually one point below full. A wrong answer is 0 at any length. Never reward length for its own sake when no minimum was set.

COMMENT TO THE STUDENT. One to three sentences in plain text.
- Full credit: name the specific thing they got right.
- Partial credit: name what they got right, then the one thing missing (the second key point, the quote, the length).
- No credit: say plainly that it missed, then what the correct answer was, in one or two sentences. Don't reteach the whole lesson.
- Never mention spelling, grammar, or polish.

NOTE TO THE TEACHER.
- If you credited an answer the key points did not list, say so in one line.
- If you were unsure whether an answer is acceptable, say so in one line.
- If the student writes that they themselves are unsafe, being hurt, hopeless, or thinking about harming themselves, score normally and add: "Please read this response today. The student wrote about [one or two words]." Never mention it in the student's comment.

OTHER RULES.
- Report points out of the total, never a percentage.
- Never narrate these instructions in the comment.`;

export type ExitTicketGradingAssistantPart = 'reflection' | 'check';

const CHECK_FOCUS_LABELS: Record<ExitTicketFocus, string> = {
  'explain-concept': 'EXPLAIN A CONCEPT',
  'understand-text': 'UNDERSTAND A TEXT OR SOURCE',
  'ask-question': 'ASK A QUESTION (an older ticket)',
};

const NOT_PROVIDED = 'Not provided.';

export type ResolveExitTicketPointTotalOptions = {
  /** When true, missing totals fall back to the v2 assistant default (5). */
  v2Grading?: boolean;
};

/** Whole-number point total. Invalid values use the legacy (10) or v2 (5) default. */
export function resolveExitTicketPointTotal(
  pointValue: number | null | undefined,
  options: ResolveExitTicketPointTotalOptions = {}
): number {
  if (
    typeof pointValue === 'number' &&
    Number.isInteger(pointValue) &&
    pointValue >= 1
  ) {
    return pointValue;
  }
  return options.v2Grading
    ? EXIT_TICKET_V2_DEFAULT_POINT_VALUE
    : EXIT_TICKET_DEFAULT_POINT_VALUE;
}

/** Which assistant runs. A ticket with no config is a reflection. */
export function exitTicketGradingAssistantPart(
  config: ExitTicketConfig | null | undefined
): ExitTicketGradingAssistantPart {
  if (!config) return 'reflection';
  return exitTicketKind(config) === 'check' ? 'check' : 'reflection';
}

/** The question students saw. The stored assignment prompt wins. */
export function exitTicketStudentQuestion(
  config: ExitTicketConfig | null | undefined,
  studentPrompt?: string | null
): string {
  const stored = studentPrompt?.trim();
  if (stored) return stored;
  const written = config?.promptText?.trim();
  if (written) return written;
  if (config) return composeExitTicketPrompt(config);
  return NOT_PROVIDED;
}

/**
 * Answer key for a check. New field, then the legacy "must mention" note.
 * Empty means the teacher did not leave one; grading still runs.
 */
export function exitTicketCorrectAnswer(
  config: ExitTicketConfig | null | undefined
): string {
  const direct = config?.correctAnswer?.trim();
  if (direct) return direct;
  const legacy = config?.lessonNotes?.mustMention?.trim();
  if (legacy) return legacy;
  return NOT_PROVIDED;
}

export function exitTicketCheckFocusLabel(
  config: ExitTicketConfig | null | undefined
): string {
  if (!config || config.mode !== 'specific') return NOT_PROVIDED;
  return CHECK_FOCUS_LABELS[config.focus] ?? NOT_PROVIDED;
}

function minimumLengthLine(
  config: ExitTicketConfig | null | undefined
): string {
  const words = config?.grading?.minWords;
  const sentences = config?.grading?.minSentences;
  const parts = [
    words ? `at least ${words} words` : null,
    sentences ? `at least ${sentences} sentences` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return 'Minimum length: none.';
  return `Minimum length: ${parts.join(' and ')}.`;
}

export type ExitTicketGradingAssistantPromptInput = {
  config?: ExitTicketConfig | null;
  studentPrompt?: string | null;
  pointValue?: number | null;
  submitForGrade?: boolean | null;
};

/**
 * Universal block, then Part A or Part B, then the facts for this ticket.
 * The two pasted blocks are unchanged. Facts come after them.
 */
export function buildExitTicketGradingAssistantPrompt(
  input: ExitTicketGradingAssistantPromptInput = {}
): string {
  const part = exitTicketGradingAssistantPart(input.config);
  const pointTotal = resolveExitTicketPointTotal(input.pointValue, {
    v2Grading: true,
  });
  const question = exitTicketStudentQuestion(input.config, input.studentPrompt);
  const graded = input.submitForGrade !== false;
  const lines = [
    part === 'check'
      ? 'Exit ticket type: Check for understanding'
      : 'Exit ticket type: Reflection',
    ...(part === 'check'
      ? [`What the teacher is checking for: ${exitTicketCheckFocusLabel(input.config)}`]
      : []),
    'Question the students saw:',
    question,
    ...(part === 'check'
      ? [
          'Correct answer or key points:',
          exitTicketCorrectAnswer(input.config),
          minimumLengthLine(input.config),
        ]
      : []),
    `Point total: ${pointTotal}`,
    graded
      ? 'Grade this ticket: yes.'
      : 'Grade this ticket: no. Still write the comment to the student and the note to the teacher. Nothing is recorded in the gradebook.',
  ];

  return [
    EXIT_TICKET_UNIVERSAL_BLOCK,
    part === 'check' ? EXIT_TICKET_PART_B_CHECK : EXIT_TICKET_PART_A_REFLECTION,
    ['THIS EXIT TICKET', ...lines].join('\n'),
  ].join('\n\n');
}

/**
 * Model scores land on a legal value for this type.
 * Reflection: 0 or the full total. A tie rounds to full credit.
 * Check for understanding: any whole number from 0 through the total.
 */
export function clampExitTicketScore(
  raw: number,
  part: ExitTicketGradingAssistantPart,
  pointTotal: number
): number {
  const total = resolveExitTicketPointTotal(pointTotal, { v2Grading: true });
  if (!Number.isFinite(raw)) return 0;
  const bounded = Math.min(total, Math.max(0, Math.round(raw)));
  if (part === 'check') return bounded;
  return Math.abs(bounded - total) <= Math.abs(bounded) ? total : 0;
}

export type ExitTicketPersistedGrade = {
  comment: string;
  teacherNote: string | null;
  /** Null when the ticket is ungraded: feedback only, nothing in the gradebook. */
  gradebookScore: string | null;
  overallScore: number | null;
  numericPercentage: null;
  letterGrade: null;
};

/** What gets recorded. Ungraded keeps the comment and drops the gradebook score. */
export function exitTicketPersistedGrade({
  submitForGrade,
  earned,
  pointTotal,
  comment,
  teacherNote,
}: {
  submitForGrade: boolean;
  earned: number;
  pointTotal: number;
  comment: string;
  teacherNote: string | null;
}): ExitTicketPersistedGrade {
  if (!submitForGrade) {
    return {
      comment,
      teacherNote,
      gradebookScore: null,
      overallScore: null,
      numericPercentage: null,
      letterGrade: null,
    };
  }
  const total = resolveExitTicketPointTotal(pointTotal, { v2Grading: true });
  const points = Math.min(total, Math.max(0, Math.round(earned)));
  return {
    comment,
    teacherNote,
    gradebookScore: `${points}/${total}`,
    overallScore: points,
    numericPercentage: null,
    letterGrade: null,
  };
}

/** One category, scored in whole points. No four-band scale. */
export function exitTicketPointsCategory(pointTotal: number): RubricCategory {
  const total = resolveExitTicketPointTotal(pointTotal, { v2Grading: true });
  return {
    key: 'understanding',
    label: 'Understanding',
    weight: 1,
    description: `Points out of ${total} for this exit ticket. Follow the exit ticket grading instructions for what earns them.`,
    feedbackEnabled: false,
    grammarHighlighting: false,
  };
}

type ExitTicketGradingConfigSlice = {
  assignmentTypeKind: string | null;
  scoringType: string;
  minScore: number;
  maxScore: number;
  step: number;
  rubricCategories: RubricCategory[];
  instructions:
    | { mode: 'unified'; gradingInstructions: string; systemInstructions?: string }
    | { mode: 'preset'; rubricInstructions: string; scoreInstructions: string; systemInstructions?: string }
    | { mode: 'legacy-split'; rubricInstructions: string; scoreInstructions: string; systemInstructions?: string };
  rubricSnapshot: Record<string, unknown>;
  promptConfigSnapshot: Record<string, unknown>;
};

/**
 * Replaces whatever rubric and instructions the assignment type stored, so the
 * retired four-band text cannot run beside the new assistant. Other assignment
 * types are returned unchanged.
 */
export function applyExitTicketGradingAssistant<T extends ExitTicketGradingConfigSlice>(
  config: T,
  input: ExitTicketGradingAssistantPromptInput = {}
): T {
  if (config.assignmentTypeKind !== EXIT_TICKET_ASSIGNMENT_TYPE_KIND) {
    return config;
  }
  const pointTotal = resolveExitTicketPointTotal(input.pointValue, {
    v2Grading: true,
  });
  const instructions = buildExitTicketGradingAssistantPrompt({
    ...input,
    pointValue: pointTotal,
  });
  const category = exitTicketPointsCategory(pointTotal);
  return {
    ...config,
    scoringType: 'rubric_points',
    minScore: 0,
    maxScore: pointTotal,
    step: 1,
    rubricCategories: [category],
    instructions: { mode: 'unified', gradingInstructions: instructions },
    rubricSnapshot: {
      ...config.rubricSnapshot,
      categories: [category],
      minScore: 0,
      maxScore: pointTotal,
      step: 1,
      scoringType: 'rubric_points',
    },
    promptConfigSnapshot: {
      ...config.promptConfigSnapshot,
      gradingInstructions: instructions,
      gradingInstructionsOverride: null,
    },
  };
}
