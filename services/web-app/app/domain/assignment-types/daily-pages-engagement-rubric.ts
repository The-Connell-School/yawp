import type {
  PromptConfigData,
  RubricCategory,
  RubricData,
  RubricScoreBand,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import {
  dailyPagesEngagementTierBands,
  formatDailyPagesEngagementBandRange,
} from './daily-pages-engagement-tier-bands';

export const DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY = 'engagement_with_prompt';
export const DAILY_PAGES_ENGAGEMENT_SCALING_RULE = 'daily_pages_engagement_v2';
export const DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL = 100;
export const MIN_DAILY_PAGES_ENGAGEMENT_POINT_TOTAL = 5;

export const DAILY_PAGES_ENGAGEMENT_TIER_LABELS = [
  'Excellent',
  'Good',
  'Needs More',
  'Not Present',
] as const;

const TIER_DESCRIPTIONS: Record<
  (typeof DAILY_PAGES_ENGAGEMENT_TIER_LABELS)[number],
  string
> = {
  Excellent:
    'The student genuinely engaged with the day\'s prompt. Real thoughts, specific details, a mind visibly at work on the page — they took the prompt somewhere. Depth beats length: a brief entry full of real thinking earns full credit, and a long one earns it too. Rough writing, typos, and rambling are completely irrelevant.\n\nScore: always the full total. There is no "within the band" here. If the engagement is real but you find yourself wanting to take a point off, that is the signal to look again: either it is all in and gets everything, or it is a strong Good and gets the top of that band.',
  Good:
    'The student completed it, but at the surface: generic statements, minimal development, the motions without the mind. Also lands here: genuine writing that ignores the prompt — real engagement with the page, but not with the topic. (Feedback credits the writing warmly, then redirects: "Next time, aim this energy at the prompt.")\n\nWithin the band: upper end when something genuine flickers through — one real specific, one honest sentence, a thought that starts to go somewhere before it stops. Middle for a clean, ordinary completion. Lower end when it is motion only, or when the writing is real but lands nowhere near the prompt.',
  'Needs More':
    'Token effort: a line or two, a restated prompt, "I don\'t know," or off-task filler. Something was submitted, but no real attempt was made.\n\nWithin the band: upper end when there is a fragment of a real attempt buried in it — a student who started and gave up is further along than one who never started. Lower end for a restated prompt or pure filler.',
  'Not Present':
    'Not enough on the page to evaluate against the tiers.\n\n• A few words, an unfinished sentence, an answer that stops.\n• Something genuinely submitted and attempted, but not enough there to evaluate against Needs More or higher.\n• Blank or nothing submitted.\n\nThis band is wide because it does two jobs. Place within it by asking whether any attempt was made, never whether the work is good: top of the band when something was genuinely submitted and attempted but there is not enough there to evaluate; middle for a fragment; 0 for blank or nothing submitted.\n\nA student who wrote two honest sentences and stopped is meaningfully different from one who submitted an empty document. The band is wide enough to say so; use it.',
};

export const DAILY_PAGES_ENGAGEMENT_GRADING_INSTRUCTIONS = [
  'Anchor your read in the day\'s prompt. When the assignment\'s prompt is available to you, judge engagement with that prompt: did the student actually take it up, wrestle with it, respond to what it asked? The prompt is your reference point for the Excellent vs. Good line and for spotting off-prompt writing. If no prompt text is available, judge engagement with the act of writing itself.',
  'Choose the tier first, then the number. The tier is the real judgment; the band exists only so that a strong Good and a barely-there one don\'t receive an identical score. Use the Within the band guidance under each tier. Whole numbers only, and never outside the band — a score is either in this tier or it belongs in the next one.',
  'Excellent is the full total, every time. Never 28 of 30, never 95 of 100. If you are not prepared to give every point, the tier is Good.',
  'Never mention grammar, spelling, syntax, or organization — not in the score, not in the feedback. Not even as a gentle aside.',
  'Never evaluate whether the content is correct. You measure engagement only. If a teacher is looking for something specific in the responses, that is the teacher\'s read to make, not yours.',
  'Feedback is 1–3 warm sentences, in the producer\'s voice: name one real thing the student said and respond to it like a human who actually read it ("The detail about your grandmother\'s kitchen — that\'s the good stuff"). At most one nudge. No audits, no checklists, no category breakdowns.',
  'If an entry appears pasted or wildly unlike the student\'s own register, don\'t penalize on suspicion — score what\'s on the page and add a brief note for the teacher.',
  'Report the point value, never a percentage. Schools use different grading scales; a percentage asserts a conversion the platform doesn\'t get to make.',
  'The teacher can adjust any tier, score, or comment. Nothing is final until the teacher reviews it.',
].join('\n');

export const DAILY_PAGES_ENGAGEMENT_SCORING_SCALE: ScoringScaleData = {
  type: 'rubric_points',
  minScore: 0,
  maxScore: DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL,
  step: 1,
  compositeMin: 0,
  compositeMax: DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL,
};

function engagementBandsForTotal(total: number): RubricScoreBand[] {
  return dailyPagesEngagementTierBands(total).map((band) => ({
    min: band.min,
    max: band.max,
    label: band.label,
    description: `${TIER_DESCRIPTIONS[band.label as keyof typeof TIER_DESCRIPTIONS]}\n\nConfigured band for a ${total}-point assignment: ${formatDailyPagesEngagementBandRange(band)}.`,
  }));
}

function engagementScoreLabelsForTotal(total: number): RubricScoreLabel[] {
  const bands = dailyPagesEngagementTierBands(total);
  const labels: RubricScoreLabel[] = [];
  for (const band of bands) {
    const anchor =
      band.tier === 'excellent'
        ? band.max
        : band.tier === 'not_present' && band.min === 0
          ? 0
          : band.max;
    const existing = labels.find((entry) => entry.value === anchor);
    if (existing) {
      existing.label = `${existing.label} / ${band.label}`;
    } else {
      labels.push({ value: anchor, label: band.label });
    }
  }
  return labels.sort((a, b) => a.value - b.value);
}

export function buildDailyPagesEngagementRubricCategory(
  total: number = DAILY_PAGES_ENGAGEMENT_LIBRARY_REFERENCE_TOTAL
): RubricCategory {
  return {
    key: DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
    label: 'Engagement with Prompt',
    weight: 1,
    description:
      'Measures engagement — the student\'s willingness to show up, put real thoughts on the page, and build a relationship with writing. Does not measure grammar, spelling, syntax, organization, polish, or the correctness of the content.',
    scoreLabels: engagementScoreLabelsForTotal(total),
    bands: engagementBandsForTotal(total),
    feedbackEnabled: false,
    grammarHighlighting: false,
  };
}

export const DAILY_PAGES_ENGAGEMENT_RUBRIC: RubricData = {
  categories: [buildDailyPagesEngagementRubricCategory()],
};

export const DAILY_PAGES_ENGAGEMENT_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'What this measures: engagement — the student\'s willingness to show up, put real thoughts on the page, and build a relationship with writing. What this never measures: grammar, spelling, syntax, organization, polish, or the correctness of the content. Daily Pages is low-stakes practice; messiness is welcome and expected.',
    '',
    'The teacher sets the point total — any whole number from 5 up. The tier is the judgment; the band is only resolution within it. Choose the tier first (Excellent, Good, Needs More, Not Present), then assign a whole-number score inside that tier\'s band for that total. Excellent is always the full total only.',
    '',
    'Grading Assistant Instructions',
    DAILY_PAGES_ENGAGEMENT_GRADING_INSTRUCTIONS,
  ].join('\n'),
};

export function usesDailyPagesEngagementPointScaling(
  outputSchema: Record<string, unknown> | null | undefined
): boolean {
  return outputSchema?.assignmentPointScaling === DAILY_PAGES_ENGAGEMENT_SCALING_RULE;
}

export function assignmentTypeUsesDailyPagesEngagementRubric({
  kind,
  rubricName,
  outputSchema,
}: {
  kind?: string | null;
  rubricName?: string | null;
  outputSchema?: Record<string, unknown> | null;
}): boolean {
  if (rubricName === 'daily-pages-engagement') return true;
  if (usesDailyPagesEngagementPointScaling(outputSchema)) return true;
  return kind === 'daily_pages' || kind === 'class_starter';
}
