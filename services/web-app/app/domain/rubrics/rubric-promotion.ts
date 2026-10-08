import { z } from 'zod';
import { parseRubricSchema, type RubricSchema } from './rubric-schema';
import { validateScoreScale } from '../assignment-types/score-scale-steps';

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };
const json: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.string(), z.number().finite(), z.boolean(), z.array(json), z.record(json)]));
const text = z.string().trim().min(1);
const number = z.number().finite();
const scale = z.object({
  type: text, minScore: number, maxScore: number, step: number.int().min(1).optional(),
  compositeMin: number.optional(), compositeMax: number.optional(),
}).strict();
const category = z.object({
  key: text, label: text, description: text, weight: number.min(0),
  scoreLabels: z.array(z.object({ value: number, label: text }).strict()).optional(),
  // Band descriptions may be blank: production rubrics store bands whose wording lives in the label.
  bands: z.array(z.object({ min: number, max: number, label: text, description: z.string() }).strict()).optional(),
  feedbackEnabled: z.boolean().optional(), grammarHighlighting: z.boolean().optional(),
}).strict();
const input = z.object({
  name: z.string().regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/).max(120),
  title: text.max(200),
  scoringScale: scale.optional(),
  rubric: z.object({ categories: z.array(category).min(1).max(100) }).strict(),
  promptConfig: z.object({
    systemInstructions: z.string().optional(), gradingInstructions: z.string().optional(),
    instructionsPreset: z.string().optional(), systemMessageTemplate: z.string().optional(), userMessageTemplate: z.string().optional(),
    scoreInstructions: z.string().optional(), rubricInstructions: z.string().optional(),
  }).strict().optional(),
  outputSchema: z.record(json).optional(), calibrationNotes: z.string().nullable().optional(),
  scoringMode: z.enum(['weighted_categories', 'holistic_tier']).optional(),
}).strict();
export type RubricValidationIssue = { path: string; message: string };
export type RubricPromotionValidation = { ok: true; schema: RubricSchema } | { ok: false; issues: RubricValidationIssue[] };

/** A strict write boundary; legacy readers remain permissive for stored content. */
export function validateRubricPromotion(raw: unknown): RubricPromotionValidation {
  try {
    const serialized = JSON.stringify(raw);
    if (!serialized || new TextEncoder().encode(serialized).length > 262144)
      return { ok: false, issues: [{ path: '/', message: 'Provide a rubric document no larger than 256 KiB.' }] };
  } catch { return { ok: false, issues: [{ path: '/', message: 'Provide a JSON rubric document.' }] }; }
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(issue => ({ path: '/' + issue.path.map(part => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/'), message: issue.message })) };
  const value = parsed.data;
  const scoring = value.scoringScale ?? { type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 };
  const issues: RubricValidationIssue[] = [];
  const report = (path: string, message: string) => { issues.push({ path, message }); };
  // Bound the enumeration performed by existing score-dropdown helpers.
  if (scoring.maxScore - scoring.minScore > 10000) report('/scoringScale', 'A scale may span at most 10,000 points.');
  else {
    const error = validateScoreScale(scoring);
    if (error) report('/scoringScale', error);
  }
  if ((scoring.compositeMin === undefined) !== (scoring.compositeMax === undefined) ||
    (scoring.compositeMin !== undefined && scoring.compositeMax !== undefined && scoring.compositeMax <= scoring.compositeMin))
    report('/scoringScale', 'Composite bounds must be supplied together with max greater than min.');
  const keys = new Set<string>();
  let totalWeight = 0;
  value.rubric.categories.forEach((c, index) => {
    const path = `/rubric/categories/${index}`;
    if (keys.has(c.key)) report(`${path}/key`, 'Category keys must be unique.');
    keys.add(c.key); totalWeight += c.weight;
    const scores = new Set<number>();
    for (const [i, label] of (c.scoreLabels ?? []).entries()) {
      if (scores.has(label.value) || label.value < scoring.minScore || label.value > scoring.maxScore || (label.value - scoring.minScore) % (scoring.step ?? 1) !== 0)
        report(`${path}/scoreLabels/${i}/value`, 'Score labels must be unique values on the scoring scale.');
      scores.add(label.value);
    }
    const bands = c.bands ?? [];
    for (const [i, band] of bands.entries()) {
      if (band.min > band.max || band.min < scoring.minScore || band.max > scoring.maxScore)
        report(`${path}/bands/${i}`, 'Band bounds must be ordered and within the scoring scale.');
      if (bands.slice(0, i).some(previous => band.min <= previous.max && previous.min <= band.max))
        report(`${path}/bands/${i}`, 'Proficiency bands cannot overlap.');
    }
  });
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) report('/rubric/categories', 'Total category weight must be positive and finite.');
  if (issues.length) return { ok: false, issues };
  const normalized = parseRubricSchema(value);
  return normalized.ok ? normalized : { ok: false, issues: [{ path: '/', message: normalized.error }] };
}
