import type { AssignmentTypeGradingInstructions } from '~/domain/assignment-types/assignment-type-grading-config.server';
import type { GradingPromptShape } from './grading-prompt-shape';

/**
 * The two strings the rubric-evaluation call actually sends: the system prompt
 * and the user prompt. Assembling them here rather than inline in the route is
 * what makes the request something you can print, diff, and test — a rubric can
 * only be swapped with confidence if the payload it produces is inspectable.
 */
export type GradingRequest = {
  system: string;
  userPrompt: string;
};

export function buildGradingRequest({
  promptShape,
  instructions,
  label,
  studentFirstName,
  assignmentPrompt,
  gradingContext,
  essayText,
}: {
  promptShape: GradingPromptShape;
  instructions: AssignmentTypeGradingInstructions;
  label: string;
  studentFirstName: string;
  assignmentPrompt: string | null | undefined;
  /**
   * What this particular assignment adds for the grader and the student never
   * saw: how to read the rubric for it, and any notes the teacher gave.
   * Absent for every assignment that supplies none, which keeps the payload
   * for every existing type byte-identical.
   */
  gradingContext?: string | null;
  essayText: string;
}): GradingRequest {
  const assignmentPromptSection = assignmentPrompt?.trim()
    ? `Assignment prompt: ${assignmentPrompt.trim()}`
    : 'Assignment prompt: No assignment prompt was provided.';
  const gradingContextSection = gradingContext?.trim()
    ? `\n\n${gradingContext.trim()}`
    : '';

  const header = `Student first name: ${studentFirstName}\n\nAssignment type grading config: ${label}\n\nRubric category keys (use these exact keys in categories[].key):\n${promptShape.rubricText}`;
  const tail = `${assignmentPromptSection}${gradingContextSection}\n\nEssay:\n${essayText}`;

  if (instructions.mode === 'unified') {
    return {
      system: `${promptShape.systemPrompt}\nFollow the grading instructions in the user prompt exactly.`,
      userPrompt: `${header}\n\nGrading instructions:\n${instructions.gradingInstructions}\n\n${tail}`,
    };
  }

  const systemInstructions =
    instructions.mode === 'legacy-split'
      ? instructions.systemInstructions
      : undefined;
  const templateSystemInstructions = systemInstructions
    ? `${systemInstructions}\n\n`
    : '';

  return {
    system: `${templateSystemInstructions}${promptShape.systemPrompt}\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n${instructions.scoreInstructions}`,
    userPrompt: `${header}\n\nRubric Instructions:\n${instructions.rubricInstructions}\n\n${tail}`,
  };
}
