import { Form } from 'react-router';
import { Users } from 'lucide-react';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import { Badge } from '~/components/ui/badge';
import { formatDateOnly } from '~/utils/date-only';
import { cn } from '~/utils/misc';

export type StudentAssignmentCardAssignment = {
  /** ClassAssignment id — what the start action is posted against. */
  id: string;
  /** Optional due date for this class assignment. */
  dueAt?: Date | string | null;
  isNew?: boolean;
  assignment: {
    title: string | null;
    prompt: string | null;
    collaborationEnabled?: boolean;
    assignmentType: {
      title: string;
      image?: { id: string; altText?: string | null } | null;
    };
  };
};

/**
 * One assignment a student can open. Solo assignments create/reuse the
 * student's document; collaborative assignments open the artifact their
 * teacher already created for the student's group.
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
        className="relative flex h-full w-full flex-col rounded-lg border bg-muted text-left transition-shadow hover:shadow"
      >
        {classAssignment.isNew ? (
          <Badge
            variant="success"
            size="sm"
            className="absolute right-2 top-2 z-10 px-1.5 py-0 text-[0.625rem] font-semibold uppercase tracking-wide"
            data-testid="student-assignment-new-pill"
          >
            New
          </Badge>
        ) : null}
        <div
          className={cn(
            'h-24 w-full overflow-hidden rounded-t-lg px-3 py-2',
            classAssignment.assignment.assignmentType.image?.id
              ? ''
              : 'bg-gradient-to-br from-foreground/5 to-foreground/20'
          )}
        >
          {classAssignment.assignment.assignmentType.image?.id ? (
            <AssignmentTypeTileImage
              imageId={classAssignment.assignment.assignmentType.image.id}
              alt={
                classAssignment.assignment.assignmentType.image.altText ??
                classAssignment.assignment.assignmentType.title
              }
              className="h-full w-full rounded-md object-cover"
            />
          ) : (
            <p className="line-clamp-3 text-xs text-muted-foreground">
              {classAssignment.assignment.prompt}
            </p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <h4 className="text-foreground/90 font-medium">
            {classAssignment.assignment.title?.trim() || 'Untitled Assignment'}
          </h4>
          <p className="text-xs text-muted-foreground">
            {classAssignment.assignment.assignmentType.title}
          </p>
          {classAssignment.assignment.collaborationEnabled ? (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Open shared group document
            </p>
          ) : null}
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
