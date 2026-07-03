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
