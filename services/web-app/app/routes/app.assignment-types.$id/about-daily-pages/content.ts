// Teacher-facing Daily Pages copy. Grading claims match the engagement rubric.

import {
  DAILY_PAGES_ENGAGEMENT_TIER_LABELS,
  DAILY_PAGES_ENGAGEMENT_GRADING_INSTRUCTIONS,
} from '~/domain/assignment-types/daily-pages-engagement-rubric';
import { dailyPagesEngagementTierBands } from '~/domain/assignment-types/daily-pages-engagement-tier-bands';

export const ABOUT_HEADING = 'About Daily Pages';

export const ABOUT_LEDE =
  'Daily Pages is low-stakes writing practice: bell ringers, exit tickets, journal reflections. The grading assistant measures engagement — whether students showed up, put real thoughts on the page, and built a relationship with writing. It never measures grammar, spelling, syntax, organization, polish, or correctness of the content.';

export const WHAT_IT_IS_HEADING = 'What a Daily Pages entry is';

export const WHAT_IT_IS: string[] = [
  'Open-ended writing tied to your prompt (or to the act of writing itself when no prompt is attached).',
  'Short enough to assign often — often one sitting, sometimes a few minutes at the start or end of class.',
  'Graded on engagement in four tiers: Excellent, Good, Needs More, and Not Present.',
  'Messy, rough, or rambling writing is welcome; the assistant does not mark grammar or comment on mechanics.',
  'Scored in points you set (any whole number from 5 up), not as a percentage.',
];

export const WHAT_IT_IS_NOT_HEADING = 'What it is not';

export const WHAT_IT_IS_NOT: { claim: string; detail: string }[] = [
  {
    claim: 'Not a formal essay paragraph.',
    detail:
      'Class Starter and Daily Pages both value engagement, but Daily Pages is the assignment type schools use for daily engagement grading at scale. For open-ended “start class” writing with the same rubric, use Class Starter.',
  },
  {
    claim: 'Not a reading check.',
    detail:
      'The assistant measures whether students engaged with the prompt, not whether their facts are correct.',
  },
  {
    claim: 'Not a grammar exercise.',
    detail:
      'Grammar and syntax are never scored or highlighted on Daily Pages.',
  },
];

export const HOW_ITS_GRADED_HEADING = 'How it is graded';

export const HOW_ITS_GRADED_INTRO =
  'You choose the point total (5 or more). The assistant picks a tier, then a whole-number score inside that tier’s band. Excellent is always the full total — never 28 of 30 or 95 of 100.';

export type GradingSummaryRow = {
  tier: string;
  share: string;
  gloss: string;
};

const REFERENCE_TOTAL = 30;
const referenceBands = dailyPagesEngagementTierBands(REFERENCE_TOTAL);

export const GRADING_SUMMARY: GradingSummaryRow[] = [
  {
    tier: 'Excellent',
    share: '100% — the full total',
    gloss:
      'Real engagement with the prompt: specific thoughts, a mind at work. Depth beats length.',
  },
  {
    tier: 'Good',
    share: '80–89%',
    gloss:
      'Surface completion or genuine writing that ignores the prompt; feedback can redirect toward the prompt.',
  },
  {
    tier: 'Needs More',
    share: '70–79%',
    gloss: 'Token effort: a line or two, restated prompt, or filler.',
  },
  {
    tier: 'Not Present',
    share: '0–69%',
    gloss:
      'Not enough to evaluate; the band distinguishes blank, fragment, and attempted-but-thin work.',
  },
];

export const SCORE_SCALE_LABELS: string[] = referenceBands.map(
  (band) => `${band.label} (${band.min === band.max ? band.min : `${band.min}–${band.max}`} on a ${REFERENCE_TOTAL}-point assignment)`
);

export const SCORE_SCALE_NOTE =
  'Bands scale proportionally to any total from 5 up. The table above illustrates a 30-point assignment.';

export const REGISTER_NOTE =
  'Feedback is one to three warm sentences with at most one nudge — no category breakdowns and no grammar comments.';

export const HOW_TO_USE_HEADING = 'Using it with a class';

export const HOW_TO_USE: string[] = [
  'Set a point total of at least 5 when students submit for a grade.',
  'Put the prompt where students can see it; the assistant anchors engagement to that prompt when it is available.',
];

export const WRITE_YOUR_OWN_HEADING = 'Writing your own prompt';

export const WRITE_YOUR_OWN_INTRO =
  'Invite real thinking about your prompt. Reflection, reaction, and “what I noticed” are appropriate — the assistant rewards engagement, not essay structure.';

export const PROMPT_RECIPE: { move: string; detail: string }[] = [
  {
    move: 'Name the prompt clearly',
    detail:
      'Students should know what to respond to; the assistant uses the assignment prompt when judging Excellent vs. Good.',
  },
  {
    move: 'Leave room for honesty',
    detail: 'Short entries count when the thinking is real.',
  },
  {
    move: 'Set a finish line',
    detail: 'A time limit or length target helps students know when they are done.',
  },
];

export const PROMPT_RECIPE_SOURCE_NOTE =
  'If the prompt needs a text, put that text in front of them.';

export const REWRITE_HEADING = 'The same prompt, before and after';

export const PROMPT_REWRITES: { before: string; after: string; why: string }[] = [
  {
    before: 'Write about chapter 4.',
    after:
      'What is one idea from chapter 4 you disagreed with, and why? A few sentences is enough.',
    why: 'The first is a topic; the second invites a real reaction.',
  },
];

export const PROMPT_WARNINGS_HEADING = 'Signs a prompt will not grade well';

export const PROMPT_WARNINGS: string[] = [
  'It can be answered in one word with no thought.',
  'It asks for a summary only, with nothing to react to.',
];

export const TIER_LABELS = [...DAILY_PAGES_ENGAGEMENT_TIER_LABELS];

export const GRADING_ASSISTANT_SUMMARY = DAILY_PAGES_ENGAGEMENT_GRADING_INSTRUCTIONS;
