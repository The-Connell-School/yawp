// What a teacher reads on the free-tier Prewriting and Thesis Statement pages,
// and on their "See how it works" guides.
//
// Each is one step of the thesis-driven essay, assigned on its own. The copy
// says what the step is, how it runs in class, and how it is scored. The
// scoring line is built from the rubric the grader is actually given, so it
// cannot say one thing while the grader does another; see content.test.ts.

import {
  PREWRITING_ASSIGNMENT_TYPE_KIND,
  PREWRITING_RUBRIC,
} from '~/domain/assignment-types/prewriting-assignment-type';
import {
  THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND,
  THESIS_STATEMENT_RUBRIC,
} from '~/domain/assignment-types/thesis-statement-assignment-type';
import type { RubricData } from '~/domain/assignment-types/assignment-type-rubric.shared';

export type WritingStepKind =
  | typeof PREWRITING_ASSIGNMENT_TYPE_KIND
  | typeof THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND;

export type WritingStepCopy = {
  /** The type's title, as on its tile. */
  title: string;
  /** What the step is, for a teacher who has never seen it. */
  lede: string;
  /** How a class runs it, in the order it happens. */
  steps: { title: string; detail: string }[];
  /** Guide hero: "Teach <title>" + highlight. */
  guideHighlight: string;
  /** What the Tutor does on this step. */
  tutor: string;
  rubric: RubricData;
  /** Said after the scoring line. */
  scoringNote: string;
};

export function isWritingStepKind(
  kind: string | null | undefined
): kind is WritingStepKind {
  return (
    kind === PREWRITING_ASSIGNMENT_TYPE_KIND ||
    kind === THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND
  );
}

/** "Scored 1–5 on Thesis/Content (85%) and Grammar/Syntax (15%)." */
export function scoringLine(rubric: RubricData): string {
  const categories = rubric.categories;
  const parts = categories.map((category) =>
    categories.length > 1
      ? `${category.label} (${Math.round(category.weight * 100)}%)`
      : category.label
  );
  const joined =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
      : parts[0];
  return `Scored 1–5 on ${joined}.`;
}

export const WRITING_STEP_COPY: Record<WritingStepKind, WritingStepCopy> = {
  prewriting: {
    title: 'Prewriting',
    lede: 'Prewriting is the first step of the thesis-driven essay. Before students commit to a thesis, they write nonstop about the prompt to find out what they actually think. It is supposed to be messy. What they leave with is a specific focus they found themselves, which becomes the starting point for their thesis statement.',
    steps: [
      {
        title: 'Teach the Pre-writing lesson',
        detail:
          'The lesson plan, slide deck, and a short tutorial video for you are below.',
      },
      {
        title: 'Assign a prompt',
        detail:
          'New → Assignment gives your class a prompt to explore. New → Document lets you try it first, the way your students will.',
      },
      {
        title: 'Students write with the Tutor',
        detail:
          'They write freely about the prompt, then work toward one specific focus they could build an essay around.',
      },
    ],
    guideHighlight: 'before the thesis.',
    tutor:
      'The Tutor asks questions that push a student from broad reactions toward one specific focus. It won’t pick the focus for them or write their prewrite.',
    rubric: PREWRITING_RUBRIC,
    scoringNote:
      'Spelling, grammar, and polish are not graded. Honest exploration that lands a usable focus scores well.',
  },
  thesis_statement: {
    title: 'Thesis Statement',
    lede: 'A great thesis statement leads to a great essay. Students start from the focus they found in prewriting, add two to four pieces of analysis to it, and shape that into one sentence that takes a clear position, is complex, and contains both observation and analysis.',
    steps: [
      {
        title: 'Teach the thesis statement lesson',
        detail:
          'The lesson plan, slide deck, and a short tutorial video for you are below.',
      },
      {
        title: 'Assign a prompt',
        detail:
          'New → Assignment gives your class a prompt to argue about. New → Document lets you try it first, the way your students will.',
      },
      {
        title: 'Students build their thesis with the Tutor',
        detail:
          'They turn an observation into analysis, then write one arguable thesis sentence.',
      },
    ],
    guideHighlight: 'one sentence at a time.',
    tutor:
      'The Tutor gives feedback on the student’s own thesis and asks what would make it more arguable. It won’t write the thesis for them.',
    rubric: THESIS_STATEMENT_RUBRIC,
    scoringNote:
      'Only the thesis sentence is graded, and the claim counts most. Grammar matters where it gets in the way of the claim.',
  },
};

export const WRITING_STEP_WILL = [
  'Give each student feedback on their own writing while they work.',
  'Ask questions that move a student toward their own ideas.',
  'Draft a score and feedback for you to review.',
];

export const WRITING_STEP_WONT = [
  'Write the work for a student.',
  'Show a student a grade before you release it.',
];
