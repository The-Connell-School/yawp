import type { AssignmentTypeAiWorkbench } from './assignment-type-ai-workbench.server';

export type AssignmentTypeAiEvaluationResult = {
  schemaVersion: 1;
  mode: 'deterministic-workbench-fixture';
  gradingAssistant: {
    categories: Array<{
      key: string;
      label: string;
      score: number;
      comment: string;
    }>;
    overallComment: string;
  };
  tutor: {
    responses: Array<{
      moduleId: string;
      moduleTitle: string;
      instructionId: string | null;
      instructionTitle: string;
      response: string;
    }>;
  };
};

export type AssignmentTypeAiLiveEvaluationResult = {
  schemaVersion: 1;
  mode: 'live-workbench-llm';
  model: string;
  gradingAssistant: {
    rawResponse: string;
  };
  tutor: {
    responses: Array<{
      moduleId: string;
      moduleTitle: string;
      instructionId: string | null;
      instructionTitle: string;
      rawResponse: string;
    }>;
  };
};

function excerpt(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function buildDeterministicAssignmentTypeAiEvaluationResult({
  workbench,
  sampleInput,
  studentFirstName,
}: {
  workbench: AssignmentTypeAiWorkbench;
  sampleInput: string;
  studentFirstName: string;
}): AssignmentTypeAiEvaluationResult {
  const sampleExcerpt = excerpt(sampleInput);
  const categories = workbench.assignmentType.rubricCategories.map((category) => ({
    key: category.key,
    label: category.label,
    score: workbench.gradingPreview.maxScore,
    comment: `Deterministic workbench feedback for ${category.label}. Sample: ${sampleExcerpt}`,
  }));

  return {
    schemaVersion: 1,
    mode: 'deterministic-workbench-fixture',
    gradingAssistant: {
      categories,
      overallComment: `${studentFirstName}, this deterministic workbench run exercised ${categories.length} rubric categories against the saved prompt snapshot.`,
    },
    tutor: {
      responses: workbench.tutorPreviews.map((preview) => ({
        moduleId: preview.moduleId,
        moduleTitle: preview.moduleTitle,
        instructionId: preview.instructionId,
        instructionTitle: preview.instructionTitle,
        response: `Deterministic tutor response for ${preview.moduleTitle} / ${preview.instructionTitle}: use the configured tutor prompt to respond to the sample draft, with focus on ${excerpt(preview.systemPrompt, 80)}.`,
      })),
    },
  };
}

export async function buildLiveAssignmentTypeAiEvaluationResult({
  workbench,
  sampleInput,
  model = process.env.AI_MODEL ?? 'claude-sonnet-4-6',
}: {
  workbench: AssignmentTypeAiWorkbench;
  sampleInput: string;
  model?: string;
}): Promise<AssignmentTypeAiLiveEvaluationResult> {
  const { getLLMCompletion } = await import('~/utils/getLLMCompletion');
  const gradingResponse = await getLLMCompletion({
    model,
    system: workbench.gradingPreview.system,
    messages: [{ role: 'user', content: workbench.gradingPreview.userPrompt }],
    maxTokens: 1200,
    temperature: 0.2,
    metadata: {
      feature: 'admin-ai-workbench',
      kind: 'grading-assistant',
      assignmentTypeId: workbench.assignmentType.id,
      assignmentTypeGradingVersion:
        workbench.assignmentType.gradingAssistantVersion,
      strictnessLevel: workbench.gradingPreview.strictnessLevel,
      rubricCategoryKeys: workbench.assignmentType.rubricCategories.map(
        (category) => category.key
      ),
    },
  });

  const tutorResponses = [];
  for (const preview of workbench.tutorPreviews) {
    const rawResponse = await getLLMCompletion({
      model,
      system: preview.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            'Student draft:',
            sampleInput,
            '',
            'Student request: What should I work on next?',
          ].join('\n'),
        },
      ],
      maxTokens: 500,
      temperature: 0.4,
      metadata: {
        feature: 'admin-ai-workbench',
        kind: 'tutor',
        assignmentTypeId: workbench.assignmentType.id,
        moduleId: preview.moduleId,
        instructionId: preview.instructionId,
      },
    });

    tutorResponses.push({
      moduleId: preview.moduleId,
      moduleTitle: preview.moduleTitle,
      instructionId: preview.instructionId,
      instructionTitle: preview.instructionTitle,
      rawResponse,
    });
  }

  return {
    schemaVersion: 1,
    mode: 'live-workbench-llm',
    model,
    gradingAssistant: {
      rawResponse: gradingResponse,
    },
    tutor: {
      responses: tutorResponses,
    },
  };
}
