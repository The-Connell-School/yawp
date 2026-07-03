import {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from '~/domain/grading/rubric-instructions';

export type AssignmentTypeGradingInstructions =
  | {
      mode: 'preset';
      rubricInstructions: string;
      scoreInstructions: string;
    }
  | {
      mode: 'unified';
      gradingInstructions: string;
    }
  | {
      mode: 'legacy-split';
      rubricInstructions: string;
      scoreInstructions: string;
      systemInstructions?: string;
    };

export function getAssignmentTypeGradingInstructions(
  promptConfig: Record<string, unknown>
): AssignmentTypeGradingInstructions {
  const gradingInstructions =
    typeof promptConfig.gradingInstructions === 'string'
      ? promptConfig.gradingInstructions.trim()
      : '';
  if (gradingInstructions) {
    return { mode: 'unified', gradingInstructions };
  }

  if (promptConfig.instructionsPreset === 'legacy_thesis_driven_essay') {
    return {
      mode: 'preset',
      rubricInstructions: gradingAssistantRubricInstructions,
      scoreInstructions: gradingAssistantScoreScaleInstructions,
    };
  }

  const rubricInstructions =
    typeof promptConfig.rubricInstructions === 'string' &&
    promptConfig.rubricInstructions.trim()
      ? promptConfig.rubricInstructions.trim()
      : 'Use the rubric language, proficiency bands, and category weights from the user prompt exactly.';
  const scoreInstructions =
    typeof promptConfig.scoreInstructions === 'string' &&
    promptConfig.scoreInstructions.trim()
      ? promptConfig.scoreInstructions.trim()
      : 'Scores must be integers in the configured range.';
  const systemInstructions =
    typeof promptConfig.systemInstructions === 'string' &&
    promptConfig.systemInstructions.trim()
      ? promptConfig.systemInstructions.trim()
      : undefined;

  return {
    mode: 'legacy-split',
    rubricInstructions,
    scoreInstructions,
    systemInstructions,
  };
}
