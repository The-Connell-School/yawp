import hornbuckleFiveParagraphEssaySource from './library/cristo-rey-hornbuckle-five-paragraph-essay.json';
import { parseRubricSchema, type RubricSchema } from './rubric-schema';

function loadBundledRubric(source: unknown, label: string): RubricSchema {
  const parsed = parseRubricSchema(source);
  if (!parsed.ok) {
    throw new Error(`Invalid bundled ${label} rubric: ${parsed.error}`);
  }
  return parsed.schema;
}

const sourceRubric = loadBundledRubric(
  hornbuckleFiveParagraphEssaySource,
  'Cristo Rey Hornbuckle Five-Paragraph Essay'
);

const outputMapping = `## Output mapping
Use the fixed grading response schema exactly. For each categories[] entry, put the whole-number score in score and format categories[].comment as "{Band} — {what earned it}. Next: {one useful improvement}." Put the holistic response in overallComment as exactly three sentences: the essay's strongest feature first, concise holistic context second, and "Next step: {one singular highest-leverage revision}" third. When essay type is genuinely uncertain or another material grading-context observation is essential, include a brief, student-readable "Instructor note: ..." clause in the second sentence. Specific errors and corrections are handled by the separate specific-corrections pass; do not invent another JSON field.`;

const sourceInstructions = sourceRubric.promptConfig.gradingInstructions ?? '';
const gradingInstructions = sourceInstructions
  .replace(
    'Then produce a holistic comment and a weighted final grade. Also compose suggestions for improvement and corrections on specific errors present in the essay.',
    'The runtime computes the weighted final grade from the six category scores. Suggestions and marked corrections on specific errors are produced by a separate specific-corrections pass.'
  )
  .replace(
    'If you genuinely cannot tell, grade it as an argument essay and say so in Instructor Notes. Never ask the student.',
    'If you genuinely cannot tell, grade it as an argument essay and include a brief, student-readable "Instructor note: essay type inferred as argument" clause in the second sentence of overallComment. Never ask the student.'
  )
  .replace(
    'A fourth paragraph is required for one-text and two-text arguments, but a counterargument or alternative interpretation is not required for literary analysis unless the assignment explicitly says so.',
    'The fourth-paragraph requirement and the counterargument requirement are separate. A fourth paragraph is required for one-text and two-text arguments, but require a counterargument only when the assignment explicitly asks for one. For literary analysis, require neither a fourth paragraph nor a counterargument or alternative interpretation unless the assignment explicitly says so.'
  )
  .replace(
    /## Feedback structure[\s\S]*?## Boundaries/,
    `${outputMapping}\n\n## Boundaries`
  );

export const CRISTO_REY_HORNBUCKLE_FIVE_PARAGRAPH_ESSAY: RubricSchema = {
  ...sourceRubric,
  promptConfig: {
    ...sourceRubric.promptConfig,
    gradingInstructions,
  },
};
