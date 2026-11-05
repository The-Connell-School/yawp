/** Query parameter the assignment type page reads to open a shared assignment. */
export const LOUNGE_SHARE_PARAM = 'loungeShare';

const TITLE_FROM_PROMPT_MAX = 60;

export type AssignmentShareSource = {
  id: string;
  title: string | null;
  prompt: string;
  submitForGrade: boolean;
  pointValue: number | null;
  tutorEnabled: boolean;
  gradingAssistantStrictnessLevel: string;
  assignmentType: { id: string; title: string };
};

export type AssignmentShareSnapshot = {
  kind: 'assignment';
  sourceId: string;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  title: string;
  prompt: string;
  settings: {
    submitForGrade: boolean;
    pointValue: number | null;
    tutorEnabled: boolean;
    gradingAssistantStrictnessLevel: string;
  };
};

function titleFromPrompt(prompt: string): string {
  const flat = prompt.replace(/\s+/g, ' ').trim();
  if (flat.length <= TITLE_FROM_PROMPT_MAX) return flat;
  const cut = flat.slice(0, TITLE_FROM_PROMPT_MAX);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

/** What a share freezes: enough for another teacher to reuse it, nothing about students. */
export function assignmentShareSnapshot(assignment: AssignmentShareSource): AssignmentShareSnapshot {
  return {
    kind: 'assignment',
    sourceId: assignment.id,
    assignmentTypeId: assignment.assignmentType.id,
    assignmentTypeTitle: assignment.assignmentType.title,
    title: assignment.title?.trim() || titleFromPrompt(assignment.prompt),
    prompt: assignment.prompt,
    settings: {
      submitForGrade: assignment.submitForGrade,
      pointValue: assignment.pointValue,
      tutorEnabled: assignment.tutorEnabled,
      gradingAssistantStrictnessLevel: assignment.gradingAssistantStrictnessLevel,
    },
  };
}

export function loungeShareHref(assignmentTypeId: string, attachmentId: string): string {
  return `/app/assignment-types/${encodeURIComponent(assignmentTypeId)}?${LOUNGE_SHARE_PARAM}=${encodeURIComponent(attachmentId)}`;
}
