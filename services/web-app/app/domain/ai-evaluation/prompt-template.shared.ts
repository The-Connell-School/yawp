import { createHash } from 'node:crypto';

export type AiPromptSurface = 'tutor' | 'grading';

export type AiPromptTemplate = {
  systemMessage: string;
  userMessage: string;
};

const promptVariables = {
  tutor: [
    'assignment_prompt',
    'base_system',
    'document_context',
    'rubric',
    'rubric_version',
    'student_message',
  ],
  grading: [
    'assignment_prompt',
    'base_system',
    'base_user_message',
    'rubric_version',
  ],
} as const satisfies Record<AiPromptSurface, readonly string[]>;

const requiredVariables = {
  tutor: {
    systemMessage: [
      'base_system',
      'assignment_prompt',
      'rubric_version',
      'rubric',
    ],
    userMessage: ['document_context', 'student_message'],
  },
  grading: {
    systemMessage: ['base_system'],
    userMessage: [
      'base_user_message',
      'assignment_prompt',
      'rubric_version',
    ],
  },
} as const satisfies Record<
  AiPromptSurface,
  Record<keyof AiPromptTemplate, readonly string[]>
>;

const promptVariablePattern = /{{\s*([a-z0-9_]+)\s*}}/gi;

export function aiPromptVariableSchema(surface: AiPromptSurface) {
  return {
    schemaVersion: 1,
    surface,
    variables: promptVariables[surface].map((name) => ({
      name,
      token: `{{${name}}}`,
    })),
  };
}

export function validateAiPromptTemplate(
  surface: AiPromptSurface,
  template: AiPromptTemplate
) {
  const allowed = new Set<string>(promptVariables[surface]);
  const unknown = [template.systemMessage, template.userMessage]
    .flatMap((message) =>
      [...message.matchAll(promptVariablePattern)].map((match) => match[1])
    )
    .find((variable) => variable && !allowed.has(variable));
  if (unknown) return `Unknown ${surface} prompt variable: {{${unknown}}}.`;

  for (const field of ['systemMessage', 'userMessage'] as const) {
    for (const variable of requiredVariables[surface][field]) {
      const requiredPattern = new RegExp(
        `{{\\s*${variable}\\s*}}`,
        'i'
      );
      if (!requiredPattern.test(template[field])) {
        return `${surface} ${field} must include {{${variable}}}.`;
      }
    }
  }
  return null;
}

export function compileAiPromptTemplate({
  surface,
  template,
  variables,
}: {
  surface: AiPromptSurface;
  template: AiPromptTemplate;
  variables: Record<string, string>;
}) {
  const validationError = validateAiPromptTemplate(surface, template);
  if (validationError) throw new Error(validationError);

  const render = (message: string) =>
    message.replace(promptVariablePattern, (_, variable: string) => {
      if (!(variable in variables)) {
        throw new Error(`Missing ${surface} prompt variable: {{${variable}}}.`);
      }
      return variables[variable] ?? '';
    });

  return {
    system: render(template.systemMessage),
    userMessage: render(template.userMessage),
  };
}

export function aiPromptContentHash(
  surface: AiPromptSurface,
  template: AiPromptTemplate
) {
  return createHash('sha256')
    .update(`${surface}\u0000${template.systemMessage}\u0000${template.userMessage}`)
    .digest('hex');
}

type PromptVersionPromotionCandidate = {
  id: string;
  assignmentTypeId: string;
  contentHash: string;
  status: string;
};

type PromptEvaluationPromotionRun = {
  promptVersionId: string;
  assignmentTypeId: string;
  promptContentHash: string;
  status: string;
  failedCases: number;
  needsReviewCases: number;
  calibrationReviewedAt: Date | null;
  calibrationReviewedByUserId: string | null;
};

export function canPromotePromptVersion(
  version: PromptVersionPromotionCandidate,
  run: PromptEvaluationPromotionRun
) {
  if (version.status !== 'draft') return 'Only draft prompts can be promoted.';
  if (
    run.promptVersionId !== version.id ||
    run.assignmentTypeId !== version.assignmentTypeId
  ) {
    return 'The evaluation run belongs to another prompt or assignment type.';
  }
  if (run.promptContentHash !== version.contentHash) {
    return 'The evaluation run is stale for this prompt content.';
  }
  if (
    run.status !== 'passed' ||
    run.failedCases > 0 ||
    run.needsReviewCases > 0
  ) {
    return 'The evaluation run must pass every blocking case.';
  }
  if (!run.calibrationReviewedAt || !run.calibrationReviewedByUserId) {
    return 'Calibration review is required before promotion.';
  }
  return null;
}
