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
  'document',
  'grading_instructions',
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
  const gradingSystemBase = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  "categories": [{"key": string, "score": {{min_score}}-{{max_score}}, "comment": string}],\n  "overallComment": string\n}\nScores must be integers {{min_score}}-{{max_score}}.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nIn overallComment, start with "{{student_first_name}}," and continue with cohesive feedback in a warm but professional tone.\nAfter the name, continue naturally (for example: "{{student_first_name}}, you ...").\nDo not use fixed lead-ins like "Overall grade," or "{{student_first_name}}, this is your overall feedback."`;
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
      userMessage: `Student first name: {{student_first_name}}\n\nAssignment type grading config: {{assignment_type}}\n\n{{strictness}}\n\nRubric category keys (use these exact keys in categories[].key):\n{{rubric}}\n\nGrading instructions:\n{{grading_instructions}}\n\nEssay:\n{{document}}`,
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
    userMessage: `Student first name: {{student_first_name}}\n\nAssignment type grading config: {{assignment_type}}\n\n{{strictness}}\n\nRubric category keys (use these exact keys in categories[].key):\n{{rubric}}\n\nRubric Instructions:\n{{grading_instructions}}\n\nEssay:\n{{document}}`,
  };
}

export function compileGradingAssistantInvocation({
  gradingConfig,
  studentFirstName,
  strictnessLevel,
  documentText,
}: {
  gradingConfig: Pick<
    ResolvedAssignmentTypeGradingConfig,
    | 'label'
    | 'minScore'
    | 'maxScore'
    | 'rubricCategories'
    | 'instructions'
    | 'promptTemplate'
  >;
  studentFirstName: string;
  strictnessLevel: GradingAssistantStrictnessLevel;
  documentText: string;
}): CompiledGradingAssistantInvocation {
  const { minScore, maxScore } = gradingConfig;
  const rubricText = gradingConfig.rubricCategories
    .map(
      (item) =>
        `${item.key}: ${item.label} (${Math.round(item.weight * 100)}%) - ${item.description}`
    )
    .join('\n');
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
    assignment_type: gradingConfig.label,
    document: documentText,
    grading_instructions: gradingInstructions,
    max_score: String(maxScore),
    min_score: String(minScore),
    rubric: rubricText,
    score_instructions: scoreInstructions,
    strictness: `Grading assistant strictness: ${strictnessLabel}\n${strictnessInstructions}`,
    strictness_instructions: strictnessInstructions,
    strictness_label: strictnessLabel,
    student_first_name: studentFirstName,
    system_instructions: assignmentTypeSystemInstructions ?? '',
  };
  const system = renderPromptTemplate(template.systemMessage, variables);
  const userMessage = renderPromptTemplate(template.userMessage, variables);

  return {
    system,
    userMessage,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 900,
  };
}
