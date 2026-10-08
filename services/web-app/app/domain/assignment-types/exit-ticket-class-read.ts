/**
 * The class read of an exit ticket: what a stack of tickets says, without a
 * teacher grading every one of them.
 *
 * Every response is already read and scored on the exit ticket's one
 * understanding category, graded or not. This turns those scores into the
 * four bands the rubric actually defines, pulls out the questions students
 * are still asking, and names the few who most need a follow-up — so a ticket
 * is something to plan tomorrow from rather than something to throw away.
 *
 * Deterministic on purpose: no model call, so it is free to show on every
 * page load and reads the same every time. Pure, so the page and the Lesson
 * Planner hand-off compose the same read.
 */
import { readRubricEntryScore } from '~/domain/assignment-insights/aggregate-rubric-performance';
import type { ExitTicketConfig } from './exit-ticket';
import {
  EXIT_TICKET_SCORE_BANDS,
  EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY,
} from './exit-ticket-rubric';

/** A short list is one a teacher acts on tonight. */
const FOLLOW_UP_CAP = 5;
const OPEN_QUESTION_CAP = 8;
/** "ok?" is not a question worth planning from. */
const OPEN_QUESTION_MIN_LENGTH = 12;
const OPEN_QUESTION_MAX_LENGTH = 240;
/** The bands below half credit: the ones that did not explain it. */
const FOLLOW_UP_BELOW = 45;

export type ExitTicketResponseInput = {
  /** Group label, name, or email: whatever the teacher would recognise. */
  studentName: string | null;
  /** Null until the response has been read. */
  rubricScores: unknown;
  text: string | null;
};

export type ExitTicketClassRead = {
  /** Every submitted response. */
  responseCount: number;
  /** The ones read and scored so far. */
  readCount: number;
  /** Best band first, the order a teacher reads a class in. */
  bands: { label: string; min: number; max: number; count: number }[];
  /** Questions students asked in their own words, once each. */
  openQuestions: string[];
  /** Weakest first; never more than a handful. */
  needsFollowUp: string[];
  /** The mix-up the teacher said to watch for, if they said one. */
  watchFor: string | null;
};

function understandingScore(rubricScores: unknown): number | null {
  if (!rubricScores || typeof rubricScores !== 'object') return null;
  const entry = (rubricScores as Record<string, unknown>)[
    EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY
  ];
  return readRubricEntryScore(
    entry as Parameters<typeof readRubricEntryScore>[0]
  );
}

/**
 * Two students asking the same thing count once. A leading "but" or "so" is
 * how a sentence joins the one before it, not part of the question.
 */
function normalizeQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:but|and|so|also|ok|okay|um|like)\s+/, '');
}

/**
 * Sentences that end in a question mark, as students wrote them. Nothing is
 * paraphrased: the point is to see the question in the student's own words.
 */
export function extractOpenQuestions(texts: string[]): string[] {
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const text of texts) {
    const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence.endsWith('?')) continue;
      if (
        sentence.length < OPEN_QUESTION_MIN_LENGTH ||
        sentence.length > OPEN_QUESTION_MAX_LENGTH
      ) {
        continue;
      }
      const key = normalizeQuestion(sentence);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(sentence);
      if (questions.length >= OPEN_QUESTION_CAP) return questions;
    }
  }
  return questions;
}

export function buildExitTicketClassRead({
  responses,
  config,
}: {
  responses: ExitTicketResponseInput[];
  config: ExitTicketConfig | null;
}): ExitTicketClassRead {
  const scored = responses.flatMap((response) => {
    const score = understandingScore(response.rubricScores);
    return score === null ? [] : [{ ...response, score }];
  });

  const bands = EXIT_TICKET_SCORE_BANDS.slice()
    .reverse()
    .map((band) => ({
      label: band.label,
      min: band.min,
      max: band.max,
      count: scored.filter(
        (response) => response.score >= band.min && response.score <= band.max
      ).length,
    }));

  const needsFollowUp = scored
    .filter((response) => response.score < FOLLOW_UP_BELOW)
    .sort((a, b) => a.score - b.score)
    .map((response) => response.studentName?.trim() || 'A student')
    .slice(0, FOLLOW_UP_CAP);

  const watchFor = config?.lessonNotes?.watchFor?.trim() || null;

  return {
    responseCount: responses.length,
    readCount: scored.length,
    bands,
    openQuestions: extractOpenQuestions(
      responses.map((response) => response.text ?? '')
    ),
    needsFollowUp,
    watchFor,
  };
}

/**
 * The opening ask for the Lesson Planner, built from the read. Carries counts
 * and the students' questions, never their names: the planner needs to know
 * what the class understood, not who.
 */
export function buildExitTicketLessonSeed({
  read,
  className,
  assignmentTitle,
}: {
  read: ExitTicketClassRead;
  className: string | null;
  assignmentTitle: string | null;
}): { prompt: string; context: string } {
  const forClass = className ? ` from ${className}` : '';
  const title = assignmentTitle ? `"${assignmentTitle}"` : 'an exit ticket';
  const lines = [
    `Here is how ${title}${forClass} came back — ${read.readCount} of ${read.responseCount} responses read:`,
    ...read.bands.map((band) => `- ${band.label}: ${band.count}`),
  ];
  if (read.watchFor) {
    lines.push('', `I was watching for this mix-up: ${read.watchFor}`);
  }
  if (read.openQuestions.length > 0) {
    lines.push(
      '',
      'Questions students are still asking, in their words:',
      ...read.openQuestions.map((question) => `- ${question}`)
    );
  }
  lines.push(
    '',
    'Plan tomorrow’s lesson from this: start where the class actually is. Ask me anything you need to know first.'
  );

  const context = [
    className ? `${className}: ` : '',
    assignmentTitle ?? 'Exit ticket',
    ' · class read',
  ].join('');
  return { prompt: lines.join('\n'), context };
}
