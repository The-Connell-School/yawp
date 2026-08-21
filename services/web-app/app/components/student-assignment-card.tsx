import { Form } from 'react-router';
import { formatDateOnly } from '~/utils/date-only';

export type StudentAssignmentCardAssignment = {
  /** ClassAssignment id — what the start action is posted against. */
  id: string;
  /** Optional due date for this class assignment. */
  dueAt?: Date | string | null;
  assignment: {
    title: string | null;
    prompt: string | null;
    assignmentType: { title: string };
  };
};

/**
 * One assignment a student can start. Posting to the start action creates the
 * student's own document for the assignment and redirects into the editor.
 */
export function StudentAssignmentCard({
  classAssignment,
  classLabel,
}: {
  classAssignment: StudentAssignmentCardAssignment;
  /** Shown when the surface mixes assignments from more than one class. */
  classLabel?: string | null;
}) {
  return (
    <Form
      method="post"
      action={`/app/class-assignments/${classAssignment.id}/start`}
    >
      <button
        type="submit"
        className="flex h-full w-full flex-col rounded-lg border bg-muted text-left transition-shadow hover:shadow"
      >
        <div className="h-24 w-full rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20 px-3 py-2">
          <p className="line-clamp-3 text-xs text-muted-foreground">
            {classAssignment.assignment.prompt}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <h4 className="text-foreground/90 font-medium">
            {classAssignment.assignment.title?.trim() || 'Untitled Assignment'}
          </h4>
          <p className="text-xs text-muted-foreground">
            {classAssignment.assignment.assignmentType.title}
          </p>
          {classAssignment.dueAt ? (
            <p className="text-xs text-muted-foreground">
              Due {formatDateOnly(classAssignment.dueAt)}
            </p>
          ) : null}
          {classLabel ? (
            <p className="text-xs text-muted-foreground">{classLabel}</p>
          ) : null}
        </div>
      </button>
    </Form>
  );
}
