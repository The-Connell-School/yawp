import { z } from 'zod';
import {
  parseRubric,
  parseScoringScale,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';

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

export function normalizeExtractedRubric(payload: ExtractedRubricPayload): {
  scoringScale: ScoringScaleData;
  rubric: RubricData;
} {
  const parsedScale = parseScoringScale(payload.scoringScale ?? null);
  const scoringScale: ScoringScaleData = {
    ...parsedScale,
    type: payload.scoringScale?.type ?? parsedScale.type,
    minScore: payload.scoringScale?.minScore ?? parsedScale.minScore,
    maxScore: payload.scoringScale?.maxScore ?? parsedScale.maxScore,
    compositeMin: payload.scoringScale?.compositeMin ?? parsedScale.compositeMin,
    compositeMax: payload.scoringScale?.compositeMax ?? parsedScale.compositeMax,
  };

  const categories = payload.rubric.categories.map((category) => {
    const label = category.label.trim();
    return {
      key: category.key?.trim() || labelToKey(label),
      label,
      weight: normalizeWeight(category.weight),
      description: category.description?.trim() ?? '',
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
        compositeMin: 2,
        compositeMax: 12,
      },
      rubric: {
        categories: [
          {
            label: 'Thesis & Content',
            weight: 0.4,
            description: 'Clear claim supported by evidence.',
          },
        ],
      },
    }),
    'scoringScale.type must be one of: weighted_1_5, act_writing_2_12, rubric_points.',
    'Category weights must be decimals between 0 and 1 and should total 1 when possible.',
    'Include every rubric category you can identify with a useful grading description.',
    'Never include markdown fences or explanatory text.',
  ].join('\n');
}
