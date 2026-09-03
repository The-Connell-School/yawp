import type {
  PromptConfigData,
  RubricData,
  RubricScoreBand,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import {
  EXIT_TICKET_LESSON_NOTE_FIELDS,
  exitTicketFocusOption,
  type ExitTicketConfig,
} from './exit-ticket';

/** Exit Tickets judge one thing, so the rubric has one category. */
export const EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY = 'understanding';

/**
 * The four things an exit ticket response can be, and the range each is worth.
 *
 * Written as bands on the scale the grade is actually read in, rather than as
 * a 0-3 scale converted afterwards. A four-step scale mapped linearly onto a
 * percentage puts "partly there" at 67% — a D for a student who understood
 * most of the lesson — which is not a judgment any teacher meant to make.
 */
export const EXIT_TICKET_SCORE_BANDS: RubricScoreBand[] = [
  {
    min: 0,
    max: 59,
    label: 'No evidence',
    description:
      'Blank, off topic, or nothing that responds to what was asked. This band is for an empty answer, never for a short or uncertain one written in good faith.',
  },
  {
    min: 60,
    max: 74,
    label: 'Names it only',
    description:
      'Repeats the topic, the term, or the teacher’s phrasing without explaining it. There is no sign yet of the student having made the idea their own.',
  },
  {
    min: 75,
    max: 85,
    label: 'Partly there',
    description:
      'The right idea in their own words, but thin, partly muddled, or missing a piece. A student who explains what they do understand and then names precisely where they get stuck belongs here: locating the edge of your own knowledge is real understanding, not the absence of it.',
  },
  {
    min: 86,
    max: 100,
    label: 'Explains it',
    description:
      'Puts the idea in their own terms and the explanation holds up. They could hand this to someone who missed the lesson and it would help.',
  },
];

export const EXIT_TICKET_SCORING_SCALE: ScoringScaleData = {
  // A valid scale type whose range matches the bands. The bands govern the
  // grade either way — a band-scored rubric is read on its own scale — but if
  // the bands were ever stripped this still degrades to a sane 0-100 score.
  type: 'rubric_points',
  minScore: 0,
  maxScore: 100,
};

export const EXIT_TICKET_RUBRIC: RubricData = {
  categories: [
    {
      key: EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY,
      label: 'Understanding',
      weight: 1,
      description:
        'How much of the lesson the student can actually explain in their own words: whether they have made the idea theirs, and how honestly they account for the parts they have not.',
      bands: EXIT_TICKET_SCORE_BANDS,
      // One category, so per-category feedback would just repeat the overall.
      feedbackEnabled: false,
      // Five minutes of writing at the end of a lesson is never marked up.
      grammarHighlighting: false,
    },
  ],
};

export const EXIT_TICKET_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading an exit ticket: a few minutes of writing at the end of a lesson, written to show what the student took away from it.',
    '',
    'Judge one thing: understanding. Read for whether the student can explain the idea in their own words, not whether they wrote a lot, wrote neatly, or used the teacher’s vocabulary.',
    '',
    'If the teacher supplied notes about the lesson, judge the response against those notes — especially anything listed as what a response should mention. Without notes, judge it against the prompt alone.',
    '',
    'Reward honesty. A student who explains what they do understand and then names precisely what still confuses them has given the most useful answer in the stack, and must never be scored below a student who hides confusion behind fluent restatement. Precise self-diagnosis is evidence of understanding. Where the prompt itself asks what is still confusing, the quality of that self-diagnosis is the whole thing you are judging — not whether the student has the right answer.',
    '',
    'Do not grade grammar, spelling, punctuation, or length, and do not comment on them.',
    '',
    'Score inside these bands, choosing the band from its description first and then a score within it:',
    ...EXIT_TICKET_SCORE_BANDS.slice()
      .reverse()
      .map(
        (band) =>
          `- ${band.min}-${band.max}, ${band.label}: ${band.description}`
      ),
    '',
    'Write the overall feedback to the student: name the part they have genuinely got, then the one thing that would take their understanding further. Speak to them, not about them.',
  ].join('\n'),
};

/**
 * Everything about this particular ticket that the grader needs and the
 * student never saw: what kind of understanding it is checking for, and
 * whatever the teacher said about the lesson.
 *
 * The rubric stays one category with one set of bands, which is what keeps
 * every exit ticket in a class aggregating into a single class-level read.
 * This is the per-assignment half — it tells the grader how to read those
 * shared bands for this ticket rather than giving the ticket its own rubric.
 *
 * Null when there is nothing to add, which is every basic ticket without
 * notes and every ticket created before any of this existed: the grader then
 * judges against the prompt alone, exactly as it did before.
 */
export function buildExitTicketGradingContext(
  config: ExitTicketConfig | null | undefined
): string | null {
  const sections: string[] = [];

  if (config?.mode === 'specific') {
    const option = exitTicketFocusOption(config.focus);
    if (option) {
      sections.push(
        [
          `What this ticket is checking for: ${option.label.toLowerCase()}.`,
          option.gradingCriteria,
        ].join('\n')
      );
    }
  }

  const notes = config?.lessonNotes;
  if (notes) {
    const lines = EXIT_TICKET_LESSON_NOTE_FIELDS.filter((field) =>
      notes[field.key]?.trim()
    ).map((field) => `- ${field.label}: ${notes[field.key].trim()}`);

    if (lines.length > 0) {
      sections.push(
        [
          "The teacher's notes on the lesson this ticket closes. The student did not see these; judge the response against them.",
          ...lines,
        ].join('\n')
      );
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}
