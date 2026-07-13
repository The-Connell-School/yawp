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

export function compileGradingAssistantInvocation({
  gradingConfig,
  studentFirstName,
  strictnessLevel,
  documentText,
}: {
  gradingConfig: Pick<
    ResolvedAssignmentTypeGradingConfig,
    'label' | 'minScore' | 'maxScore' | 'rubricCategories' | 'instructions'
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
  const gradingSystemBase = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  "categories": [{"key": string, "score": ${minScore}-${maxScore}, "comment": string}],\n  "overallComment": string\n}\nScores must be integers ${minScore}-${maxScore}.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nIn overallComment, start with "${studentFirstName}," and continue with cohesive feedback in a warm but professional tone.\nAfter the name, continue naturally (for example: "${studentFirstName}, you ...").\nDo not use fixed lead-ins like "Overall grade," or "${studentFirstName}, this is your overall feedback."`;
  const assignmentTypeSystemInstructions =
    'systemInstructions' in gradingConfig.instructions
      ? gradingConfig.instructions.systemInstructions?.trim()
      : undefined;
  const assignmentTypeSystemBlock = assignmentTypeSystemInstructions
    ? `\n\nAssignment type system instructions:\n${assignmentTypeSystemInstructions}`
    : '';

  let system = gradingSystemBase;
  let userMessage = '';

  if (gradingConfig.instructions.mode === 'unified') {
    system = `${gradingSystemBase}${assignmentTypeSystemBlock}\nFollow the grading instructions in the user prompt exactly.`;
    userMessage = `Student first name: ${studentFirstName}\n\nAssignment type grading config: ${gradingConfig.label}\n\n${strictnessBlock}Rubric category keys (use these exact keys in categories[].key):\n${rubricText}\n\nGrading instructions:\n${gradingConfig.instructions.gradingInstructions}\n\nEssay:\n${documentText}`;
  } else {
    const { rubricInstructions, scoreInstructions } =
      gradingConfig.instructions;
    const systemInstructions =
      gradingConfig.instructions.mode === 'legacy-split'
        ? gradingConfig.instructions.systemInstructions
        : assignmentTypeSystemInstructions;
    if (gradingConfig.instructions.mode === 'legacy-split') {
      const templateSystemInstructions = systemInstructions
        ? `${systemInstructions}\n\n`
        : '';
      system = `${templateSystemInstructions}${gradingSystemBase}\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n${scoreInstructions}`;
    } else {
      system = `${gradingSystemBase}${assignmentTypeSystemBlock}\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n${scoreInstructions}`;
    }
    userMessage = `Student first name: ${studentFirstName}\n\nAssignment type grading config: ${gradingConfig.label}\n\n${strictnessBlock}Rubric category keys (use these exact keys in categories[].key):\n${rubricText}\n\nRubric Instructions:\n${rubricInstructions}\n\nEssay:\n${documentText}`;
  }

  return {
    system,
    userMessage,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 900,
  };
}
