import { teacherNotesEnabled } from './teacher-notes';
import { buildGradingPromptShape } from './grading-prompt-shape';
import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  getGradingAssistantStrictnessInstructions,
  getGradingAssistantStrictnessLabel,
  type GradingAssistantStrictnessLevel,
} from './grading-assistant-strictness';

export type CompiledGradingAssistantInvocation = {
  system: string;
  userMessage: string;
  messages: Array<{ role: 'user'; content: string }>;
  maxTokens: number;
};

export type GradingAssistantPromptTemplate = {
  systemMessage: string;
  userMessage: string;
};

export const GRADING_ASSISTANT_PROMPT_VARIABLES = [
  'assignment_type',
  'assignment_prompt',
  'document',
  'grading_context',
  'grading_instructions',
  'grading_response_instructions',
  'max_score',
  'min_score',
  'rubric',
  'score_instructions',
  'strictness',
  'strictness_instructions',
  'strictness_label',
  'student_first_name',
  'system_instructions',
] as const;

const PROMPT_VARIABLE_PATTERN = /{{\s*([a-z0-9_]+)\s*}}/gi;

function renderPromptTemplate(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(PROMPT_VARIABLE_PATTERN, (_, variable: string) => {
    if (!(variable in variables)) {
      throw new Error(`Unknown grading prompt variable: ${variable}`);
    }
    return variables[variable] ?? '';
  });
}

export function validateGradingAssistantPromptTemplate(
  template: GradingAssistantPromptTemplate
) {
  const unknownVariables = [template.systemMessage, template.userMessage]
    .flatMap((message) =>
      [...message.matchAll(PROMPT_VARIABLE_PATTERN)].map((match) => match[1])
    )
    .filter(
      (variable): variable is string =>
        Boolean(variable) &&
        !GRADING_ASSISTANT_PROMPT_VARIABLES.includes(
          variable as (typeof GRADING_ASSISTANT_PROMPT_VARIABLES)[number]
        )
    );
  if (unknownVariables.length > 0) {
    return `Unknown prompt variable: {{${unknownVariables[0]}}}.`;
  }
  if (!/{{\s*document\s*}}/i.test(template.userMessage)) {
    return 'The user message must include {{document}}.';
  }
  if (!/{{\s*rubric\s*}}/i.test(template.userMessage)) {
    return 'The user message must include {{rubric}}.';
  }
  return null;
}

export function defaultGradingAssistantPromptTemplate(
  gradingConfig: Pick<
    ResolvedAssignmentTypeGradingConfig,
    'instructions'
  >
): GradingAssistantPromptTemplate {
  const gradingSystemBase = '{{grading_response_instructions}}';
  const systemInstructions =
    'systemInstructions' in gradingConfig.instructions
      ? gradingConfig.instructions.systemInstructions?.trim()
      : undefined;

  if (gradingConfig.instructions.mode === 'unified') {
    const assignmentTypeSystemBlock = systemInstructions
      ? `\n\nAssignment type system instructions:\n{{system_instructions}}`
      : '';
    return {
      systemMessage: `${gradingSystemBase}${assignmentTypeSystemBlock}\nFollow the grading instructions in the user prompt exactly.`,
      userMessage: `Student first name: {{student_first_name}}\n\nAssignment type grading config: {{assignment_type}}\n\n{{strictness}}\n\nRubric category keys (use these exact keys in categories[].key):\n{{rubric}}\n\nGrading instructions:\n{{grading_instructions}}\n\nAssignment prompt: {{assignment_prompt}}\n\nEssay:\n{{document}}`,
    };
  }

  const templateSystemInstructions =
    gradingConfig.instructions.mode === 'legacy-split' && systemInstructions
      ? `{{system_instructions}}\n\n`
      : '';
  const assignmentTypeSystemBlock =
    gradingConfig.instructions.mode === 'preset' && systemInstructions
      ? `\n\nAssignment type system instructions:\n{{system_instructions}}`
      : '';
  return {
    systemMessage: `${templateSystemInstructions}${gradingSystemBase}${assignmentTypeSystemBlock}\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n{{score_instructions}}`,
    userMessage: `Student first name: {{student_first_name}}\n\nAssignment type grading config: {{assignment_type}}\n\n{{strictness}}\n\nRubric category keys (use these exact keys in categories[].key):\n{{rubric}}\n\nRubric Instructions:\n{{grading_instructions}}\n\nAssignment prompt: {{assignment_prompt}}\n\nEssay:\n{{document}}`,
  };
}

export function compileGradingAssistantInvocation({
  gradingConfig,
  studentFirstName,
  strictnessLevel,
  documentText,
  assignmentPrompt,
  gradingContext,
}: {
  gradingConfig: Pick<
    ResolvedAssignmentTypeGradingConfig,
    | 'label'
    | 'minScore'
    | 'maxScore'
    | 'rubricCategories'
    | 'instructions'
    | 'promptTemplate'
  > & Partial<
    Pick<
      ResolvedAssignmentTypeGradingConfig,
      'outputSchemaSnapshot' | 'gradingMode' | 'rubricTotalPoints'
    >
  >;
  studentFirstName: string;
  strictnessLevel: GradingAssistantStrictnessLevel;
  documentText: string;
  assignmentPrompt?: string | null;
  /**
   * What this particular assignment adds for the grader and the student never
   * saw: how to read the rubric for it, and any notes the teacher gave.
   * Absent for every assignment that supplies none, which keeps the payload
   * for every existing type byte-identical.
   */
  gradingContext?: string | null;
}): CompiledGradingAssistantInvocation {
  const { minScore, maxScore } = gradingConfig;
  const promptShape = buildGradingPromptShape({
    categories: gradingConfig.rubricCategories,
    minScore,
    maxScore,
    studentFirstName,
    teacherNotesEnabled: teacherNotesEnabled(gradingConfig.outputSchemaSnapshot),
    gradingMode: gradingConfig.gradingMode,
  });
  const strictnessLabel = getGradingAssistantStrictnessLabel(strictnessLevel);
  const strictnessInstructions =
    getGradingAssistantStrictnessInstructions(strictnessLevel);
  const strictnessBlock = `Grading assistant strictness: ${strictnessLabel}\n${strictnessInstructions}\n\n`;
  const assignmentTypeSystemInstructions =
    'systemInstructions' in gradingConfig.instructions
      ? gradingConfig.instructions.systemInstructions?.trim()
      : undefined;
  const gradingInstructions =
    gradingConfig.instructions.mode === 'unified'
      ? gradingConfig.instructions.gradingInstructions
      : gradingConfig.instructions.rubricInstructions;
  const scoreInstructions =
    gradingConfig.instructions.mode === 'unified'
      ? ''
      : gradingConfig.instructions.scoreInstructions;
  const template =
    gradingConfig.promptTemplate ??
    defaultGradingAssistantPromptTemplate(gradingConfig);
  const variables = {
    assignment_type: gradingConfig.rubricTotalPoints
      ? `${gradingConfig.label} (total rubric points: ${gradingConfig.rubricTotalPoints})`
      : gradingConfig.label,
    assignment_prompt: assignmentPrompt?.trim() || 'No assignment prompt was provided.',
    grading_context: gradingContext?.trim() ?? '',
    grading_response_instructions: promptShape.systemPrompt,
    document: documentText,
    grading_instructions: gradingInstructions,
    max_score: String(maxScore),
    min_score: String(minScore),
    rubric: promptShape.rubricText,
    score_instructions: scoreInstructions,
    strictness: `Grading assistant strictness: ${strictnessLabel}\n${strictnessInstructions}`,
    strictness_instructions: strictnessInstructions,
    strictness_label: strictnessLabel,
    student_first_name: studentFirstName,
    system_instructions: assignmentTypeSystemInstructions ?? '',
  };
  const renderedSystem = renderPromptTemplate(template.systemMessage, variables);
  // Older managed templates do not carry the response-contract variable. The
  // explicit opt-in must still keep private observations out of public fields.
  const system = teacherNotesEnabled(gradingConfig.outputSchemaSnapshot) && !/{{\s*grading_response_instructions\s*}}/i.test(template.systemMessage)
    ? `${renderedSystem}\n\n${promptShape.systemPrompt}`
    : renderedSystem;
  const renderedUserMessage = renderPromptTemplate(template.userMessage, variables);
  // Existing managed templates predate assignment_prompt. Preserve their text
  // while ensuring a real prompt still reaches the grading assistant.
  const userMessage = assignmentPrompt?.trim() && !/{{\s*assignment_prompt\s*}}/i.test(template.userMessage)
    ? `${renderedUserMessage}\n\nAssignment prompt: ${assignmentPrompt.trim()}`
    : renderedUserMessage;
  // Same story as the assignment prompt above: no existing template carries a
  // slot for what an assignment adds for the grader, so it is appended rather
  // than dropped. An assignment that supplies none appends nothing, which
  // leaves every other type's payload exactly as it was.
  const userMessageWithContext =
    gradingContext?.trim() && !/{{\s*grading_context\s*}}/i.test(template.userMessage)
      ? `${userMessage}\n\n${gradingContext.trim()}`
      : userMessage;

  return {
    system,
    userMessage: userMessageWithContext,
    messages: [{ role: 'user', content: userMessageWithContext }],
    maxTokens: 900,
  };
}
