import { z } from 'zod';
import {
  parseRubric,
  parseScoringScale,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  DEFAULT_SCORE_STEP,
  buildScoreScaleValues,
  buildStepOptions,
} from './score-scale-steps';

const SCORING_SCALE_TYPES = [
  'weighted_1_5',
  'act_writing_2_12',
  'rubric_points',
] as const;

export const ExtractedRubricSchema = z.object({
  scoringScale: z
    .object({
      type: z.enum(SCORING_SCALE_TYPES).optional(),
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
      step: z.number().optional(),
      compositeMin: z.number().optional(),
      compositeMax: z.number().optional(),
    })
    .optional(),
  rubric: z.object({
    categories: z
      .array(
        z.object({
          label: z.string().trim().min(1),
          weight: z.number(),
          description: z.string().trim().optional(),
          key: z.string().trim().optional(),
          scoreLabels: z
            .array(
              z.object({
                value: z.number(),
                label: z.string().trim().min(1),
              })
            )
            .optional(),
        })
      )
      .min(1),
  }),
});

export type ExtractedRubricPayload = z.infer<typeof ExtractedRubricSchema>;

function labelToKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeWeight(weight: number) {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (weight > 1) return Math.min(weight / 100, 1);
  return weight;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : greatestCommonDivisor(b, a % b);
}

/**
 * The step a set of tier values implies.
 *
 * A rubric that names fixed tiers — 30 / 20 / 10 / 0 — is a stepped scale
 * whether or not the model said so. The gap they all sit on is the largest
 * step that lands on every one of them, which is the GCD of their distances
 * from the minimum.
 */
function inferStepFromScoreLabels(
  values: number[],
  minScore: number
): number | null {
  const offsets = values
    .map((value) => Math.abs(value - minScore))
    .filter((offset) => offset > 0);
  if (offsets.length === 0) return null;

  const step = offsets.reduce((acc, offset) =>
    greatestCommonDivisor(acc, offset)
  );
  return step >= 1 ? step : null;
}

export function normalizeExtractedRubric(payload: ExtractedRubricPayload): {
  scoringScale: ScoringScaleData;
  rubric: RubricData;
} {
  const parsedScale = parseScoringScale(payload.scoringScale ?? null);
  const minScore = payload.scoringScale?.minScore ?? parsedScale.minScore;
  const maxScore = payload.scoringScale?.maxScore ?? parsedScale.maxScore;

  const labelValues = payload.rubric.categories.flatMap((category) =>
    (category.scoreLabels ?? []).map((entry) => entry.value)
  );
  // A reported step above 1 is a real claim about the scale and is trusted. A
  // reported step of 1 is the default the model falls back to even when it has
  // just listed tiers at 30/20/10/0, so in that case the tier values decide —
  // they are the evidence it actually read off the page.
  const reportedStep = payload.scoringScale?.step;
  const candidateStep =
    reportedStep !== undefined && reportedStep > 1
      ? reportedStep
      : (inferStepFromScoreLabels(labelValues, minScore) ??
        reportedStep ??
        undefined);
  const allowedSteps = buildStepOptions({ minScore, maxScore });
  const step =
    candidateStep !== undefined && allowedSteps.includes(candidateStep)
      ? candidateStep
      : DEFAULT_SCORE_STEP;

  const scoringScale: ScoringScaleData = {
    ...parsedScale,
    type: payload.scoringScale?.type ?? parsedScale.type,
    minScore,
    maxScore,
    step,
    compositeMin: payload.scoringScale?.compositeMin ?? parsedScale.compositeMin,
    compositeMax: payload.scoringScale?.compositeMax ?? parsedScale.compositeMax,
  };

  const scaleValues = new Set(
    buildScoreScaleValues({ minScore, maxScore, step })
  );

  const categories = payload.rubric.categories.map((category) => {
    const label = category.label.trim();
    // A label for a score the scale does not offer would be unreachable and
    // unreadable in the editor, so it is dropped rather than stored invisibly.
    const scoreLabels = (category.scoreLabels ?? [])
      .filter((entry) => scaleValues.has(entry.value))
      .map((entry) => ({ value: entry.value, label: entry.label.trim() }))
      .sort((a, b) => a.value - b.value);

    return {
      key: category.key?.trim() || labelToKey(label),
      label,
      weight: normalizeWeight(category.weight),
      description: category.description?.trim() ?? '',
      ...(scoreLabels.length ? { scoreLabels } : {}),
    };
  });

  return {
    scoringScale,
    rubric: parseRubric({ categories }),
  };
}

export function buildRubricExtractSystemPrompt() {
  return [
    'You extract grading rubrics from classroom documents and pasted text.',
    'Return only valid JSON in this exact shape:',
    JSON.stringify({
      scoringScale: {
        type: 'weighted_1_5',
        minScore: 1,
        maxScore: 5,
        step: 1,
        compositeMin: 2,
        compositeMax: 12,
      },
      rubric: {
        categories: [
          {
            label: 'Thesis & Content',
            weight: 0.4,
            description: 'Clear claim supported by evidence.',
            scoreLabels: [{ value: 5, label: 'Exemplary' }],
          },
        ],
      },
    }),
    'scoringScale.type must be one of: weighted_1_5, act_writing_2_12, rubric_points.',
    'Category weights must be decimals between 0 and 1 and should total 1 when possible.',
    'Include every rubric category you can identify with a useful grading description.',
    // Tiered rubrics are common and were previously flattened into a range,
    // which turned "30/20/10/0" into thirty-one anonymous score rows.
    'Many rubrics score in fixed tiers rather than every whole number. When the document names tiers with point values — for example ALL IN 30, SHOWED UP 20, HARDLY THERE 10, NOT HANDED IN 0 — set minScore to the lowest tier, maxScore to the highest, and step to the gap between them (10 in that example). Use type rubric_points for those.',
    'When tiers are named, put them in scoreLabels on every category they apply to, one entry per tier, using the tier name as the label and its point value as the value. Do not invent tiers the document does not name.',
    'step must divide (maxScore - minScore) evenly, so that maxScore is reachable. Omit step when the rubric really is scored at every whole number.',
    'Never include markdown fences or explanatory text.',
  ].join('\n');
}
