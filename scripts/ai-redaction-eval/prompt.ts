/**
 * Faithful reproduction of the grading system/user prompt built in
 * services/web-app/app/routes/api.domain.grade-essay-ai/route.ts (the
 * non-AP-History / default-thesis-rubric path, ~line 598-843) for the
 * `resolvedGradingConfig.source === 'thesis-default'` case — i.e. an
 * assignment type with no owned rubric, which resolves to `mode: 'preset'`
 * instructions (`gradingAssistantRubricInstructions` +
 * `gradingAssistantScoreScaleInstructions`, no extra systemInstructions).
 *
 * Kept as literal template strings (not re-imported) because the real
 * builder lives inside a large route action and isn't exported — this is
 * the "minimal equivalent you construct" the eval brief allows for. Every
 * line here is copied verbatim from route.ts; if the real prompt changes,
 * this file needs a matching update (call this out in the report if it
 * drifts).
 */
import {
  rubricCategories,
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
  DEFAULT_MIN_SCORE,
  DEFAULT_MAX_SCORE,
} from './rubric';

export const RUBRIC_LABEL = 'Thesis-driven essay grading assistant';

export function buildRubricText(): string {
  return rubricCategories
    .map(
      (item) =>
        `${item.key}: ${item.label} (${Math.round(item.weight * 100)}%) - ${item.description}`
    )
    .join('\n');
}

/** Verbatim copy of `gradingSystemBase` from route.ts line ~815. */
export function buildGradingSystemBase(pseudonymFirstName: string): string {
  const minScore = DEFAULT_MIN_SCORE;
  const maxScore = DEFAULT_MAX_SCORE;
  return `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  \"categories\": [{\"key\": string, \"score\": ${minScore}-${maxScore}, \"comment\": string}],\n  \"overallComment\": string\n}\nScores must be integers ${minScore}-${maxScore}.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nIn overallComment, start with \"${pseudonymFirstName},\" and continue with cohesive feedback in a warm but professional tone.\nAfter the name, continue naturally (for example: \"${pseudonymFirstName}, you ...\").\nDo not use fixed lead-ins like \"Overall grade,\" or \"${pseudonymFirstName}, this is your overall feedback.\"`;
}

/**
 * Verbatim copy of the `else` (non-unified) branch of route.ts ~820-843,
 * specialized to the `mode: 'preset'` thesis-default instructions (the path
 * taken whenever an assignment type has no owned rubric — the common case
 * this eval targets).
 */
export function buildGradingPrompt({
  pseudonymFirstName,
  essayText,
}: {
  pseudonymFirstName: string;
  essayText: string;
}): { system: string; userPrompt: string } {
  const gradingSystemBase = buildGradingSystemBase(pseudonymFirstName);
  const system = `${gradingSystemBase}\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n${gradingAssistantScoreScaleInstructions}`;
  const userPrompt = `Student first name: ${pseudonymFirstName}\n\nAssignment type grading config: ${RUBRIC_LABEL}\n\nRubric category keys (use these exact keys in categories[].key):\n${buildRubricText()}\n\nRubric Instructions:\n${gradingAssistantRubricInstructions}\n\nEssay:\n${essayText}`;
  return { system, userPrompt };
}

/** Verbatim copy of the overall-comment follow-up prompt, route.ts ~887-901. */
export function buildOverallCommentPrompt({
  pseudonymFirstName,
  essayText,
  categoriesJson,
}: {
  pseudonymFirstName: string;
  essayText: string;
  categoriesJson: string;
}): { system: string; userPrompt: string } {
  const system = `You write the overall feedback sentence for a grading assistant. Return ONLY valid JSON with the schema:\n{\n  "overallComment": string\n}\nRules:\n- overallComment must start with "${pseudonymFirstName},".\n- Keep it warm, professional, and cohesive.\n- Do not include markdown or explanation.`;
  const userPrompt = `Student first name: ${pseudonymFirstName}\n\nEssay:\n${essayText}\n\nRubric category feedback:\n${categoriesJson}`;
  return { system, userPrompt };
}

/** Verbatim copy of the schema-repair prompt, route.ts ~944. */
export function buildRepairPrompt({
  pseudonymFirstName,
  rawResponseText,
  rubricKeys,
}: {
  pseudonymFirstName: string;
  rawResponseText: string;
  rubricKeys: string[];
}): { system: string; userPrompt: string } {
  const minScore = DEFAULT_MIN_SCORE;
  const maxScore = DEFAULT_MAX_SCORE;
  const system = `You repair grading assistant JSON. Return ONLY valid JSON with the schema:\n{\n  "categories": [{"key": string, "score": ${minScore}-${maxScore}, "comment": string}],\n  "overallComment": string\n}\nRules:\n- Preserve valid category scores/comments from the original output when possible.\n- Scores must be integers ${minScore}-${maxScore}.\n- Return exactly one category for each rubric key.\n- Use only these rubric keys: ${rubricKeys.join(', ')}.\n- overallComment must start with "${pseudonymFirstName},".\n- Do not include markdown or explanation.`;
  const userPrompt = `Original grading response:\n${rawResponseText}`;
  return { system, userPrompt };
}
