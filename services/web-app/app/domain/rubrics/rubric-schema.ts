import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parsePromptConfig,
  parseRubric,
  parseScoringScale,
  type PromptConfigData,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';

/**
 * One rubric, whole. The five things grading needs have always existed — they
 * were five columns on an assignment type, editable only through a form. This
 * is the same five as one object, which is what makes a rubric something you
 * can read, paste, and carry between environments.
 *
 * `name` is the identity that matches the same rubric across environments;
 * `title` is what a person reads.
 */
export type RubricSchema = {
  name: string;
  title: string;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
  outputSchema: Record<string, unknown>;
  calibrationNotes: string | null;
  /**
   * How the overall score is computed and displayed.
   * - weighted_categories (default): today's behavior; overall comes from weighted category scores
   * - holistic_tier: the model picks a tier and points out of the assignment total; categories explain only
   */
  scoringMode?: 'weighted_categories' | 'holistic_tier';
};

export type RubricSchemaParseResult =
  | { ok: true; schema: RubricSchema }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A name suggested from the pasted JSON itself, so an admin pasting a rubric
 * that already names itself does not have to retype it. Falls back to a slug
 * of the title.
 */
export function suggestRubricIdentity(raw: unknown): {
  name: string;
  title: string;
} {
  if (!isRecord(raw)) return { name: '', title: '' };

  const title = readString(raw.title) || readString(raw.label) || readString(raw.name);
  const name =
    readString(raw.name) ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  return { name, title: title || name };
}

/**
 * Accepts what an admin pastes. Everything except the categories has a sane
 * default, because a rubric that omits the output schema means "the usual
 * one", not "an error".
 */
export function parseRubricSchema(raw: unknown): RubricSchemaParseResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'The rubric must be a JSON object.' };
  }

  const identity = suggestRubricIdentity(raw);
  if (!identity.name) {
    return {
      ok: false,
      error: 'The rubric needs a "name" (or a "title" to derive one from).',
    };
  }

  // `rubric.categories` is the substance. Accept it nested or at the top level,
  // since both shapes read naturally when a rubric is written by hand.
  const rubricSource = isRecord(raw.rubric) ? raw.rubric : raw;
  const rubric = parseRubric(rubricSource);

  if (!rubric.categories.length) {
    return {
      ok: false,
      error: 'The rubric needs at least one category under "rubric.categories".',
    };
  }

  const missing = rubric.categories.find(
    (category) => !category.key || !category.label
  );
  if (missing) {
    return {
      ok: false,
      error: 'Every category needs a "key" and a "label".',
    };
  }

  return {
    ok: true,
    schema: {
      name: identity.name,
      title: identity.title,
      scoringScale: parseScoringScale(raw.scoringScale ?? null),
      rubric,
      promptConfig: parsePromptConfig(raw.promptConfig ?? null),
      outputSchema: isRecord(raw.outputSchema)
        ? raw.outputSchema
        : { ...DEFAULT_OUTPUT_SCHEMA_JSON },
      calibrationNotes: readString(raw.calibrationNotes) || null,
      ...(readString((raw as Record<string, unknown>).scoringMode) ===
      'holistic_tier'
        ? { scoringMode: 'holistic_tier' as const }
        : {}),
    },
  };
}

/** The stored schema as a person should see it: stable key order, indented. */
export function formatRubricSchema(schema: RubricSchema) {
  return JSON.stringify(
    {
      name: schema.name,
      title: schema.title,
      scoringScale: schema.scoringScale,
      rubric: schema.rubric,
      promptConfig: schema.promptConfig,
      outputSchema: schema.outputSchema,
      calibrationNotes: schema.calibrationNotes,
      ...(schema.scoringMode
        ? { scoringMode: schema.scoringMode }
        : {}),
    },
    null,
    2
  );
}
