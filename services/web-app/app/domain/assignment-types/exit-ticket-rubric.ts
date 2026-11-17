import type {
  PromptConfigData,
  RubricData,
  RubricScoreBand,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import { buildExitTicketGradingAssistantPrompt } from './exit-ticket-grading-assistant';
import {
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  type ExitTicketConfig,
} from './exit-ticket';

/** Exit Tickets judge one thing, so the rubric has one category. */
export const EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY = 'understanding';

/**
 * Retired four-band scale (Brian, 2026-11-17).
 *
 * Grading no longer uses these. They stay so the class read can still bucket
 * responses that were scored on the old 0–100 scale. A response scored by the
 * new assistant carries `pointTotal` and is converted before it is bucketed.
 * Do not paste these descriptions into the grading assistant.
 */
export const EXIT_TICKET_SCORE_BANDS: RubricScoreBand[] = [
  {
    min: 0,
    max: 0,
    label: 'No evidence',
    description:
      'Blank, off topic, or nothing that responds to what was asked — "idk" and the like. There is nothing here to read, so it earns nothing. This band is only ever for an absent answer: a short or uncertain one written in good faith belongs higher, and so does any attempt that engages with the question.',
  },
  {
    min: 1,
    max: 44,
    label: 'Names it only',
    description:
      'Repeats the topic, the term, the teacher’s phrasing, or a bare answer, without the explanation the ticket asked for. The student is on topic and has done something, but not the thing that was requested, so this stays below half credit however correct the fragment is.',
  },
  {
    min: 45,
    max: 80,
    label: 'Partly there',
    description:
      'The right idea in their own words, but thin, partly muddled, or missing a piece. A student who explains what they do understand and then names precisely where they get stuck belongs here: locating the edge of your own knowledge is real understanding, not the absence of it.',
  },
  {
    min: 81,
    max: 100,
    label: 'Explains it',
    description:
      'Puts the idea in their own terms and the explanation holds up. They could hand this to someone who missed the lesson and it would help.',
  },
];

export const EXIT_TICKET_SCORING_SCALE: ScoringScaleData = {
  type: 'rubric_points',
  minScore: 0,
  maxScore: EXIT_TICKET_DEFAULT_POINT_VALUE,
};

/**
 * The type-level default. Grade time replaces this with the assistant for the
 * ticket in front of it (Reflection or Check for understanding) and with that
 * ticket's point total. No bands: the score is a whole number of points.
 */
export const EXIT_TICKET_RUBRIC: RubricData = {
  categories: [
    {
      key: EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY,
      label: 'Understanding',
      weight: 1,
      description:
        'Points for this exit ticket. Follow the exit ticket grading instructions for what earns them.',
      feedbackEnabled: false,
      grammarHighlighting: false,
    },
  ],
};

export const EXIT_TICKET_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions:
    'Use the Exit Ticket Grading Assistant for this ticket’s type. Reflection is full credit or no credit. Check for understanding is full credit, partial credit, or no credit. Report whole points out of the point total.',
};


/**
 * The assistant for this ticket. Null when there is no exit ticket config,
 * which is every other assignment type. The four-band context this used to
 * build is retired.
 */
export function buildExitTicketGradingContext(
  config: ExitTicketConfig | null | undefined,
  extras?: {
    studentPrompt?: string | null;
    pointValue?: number | null;
    submitForGrade?: boolean | null;
  }
): string | null {
  if (!config) return null;
  return buildExitTicketGradingAssistantPrompt({
    config,
    studentPrompt: extras?.studentPrompt,
    pointValue: extras?.pointValue,
    submitForGrade: extras?.submitForGrade,
  });
}
