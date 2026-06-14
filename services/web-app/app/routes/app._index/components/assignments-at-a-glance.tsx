import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';

export type AssignmentTypeGlanceRow = {
  id: string;
  title: string;
  image?: { id: string } | null;
};

function AssignmentTypeImage({
  assignmentType,
  className,
}: {
  assignmentType: AssignmentTypeGlanceRow;
  className?: string;
}) {
  if (assignmentType.image?.id) {
    return (
      <img
        src={`/api/image/course/${assignmentType.image.id}`}
        alt=""
        className={cn('object-cover', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'bg-gradient-to-br from-foreground/5 to-foreground/20',
        className
      )}
    />
  );
}

export function AssignmentsAtAGlance({
  assignmentTypes,
}: {
  assignmentTypes: AssignmentTypeGlanceRow[];
}) {
  return (
    <div data-testid="teacher-assignments-grid">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Assignments</h2>
        <Link
          to="/app/assignments?create=1"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New assignment
        </Link>
      </div>

      {assignmentTypes.length > 0 ? (
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex w-max gap-3 pb-1">
            {assignmentTypes.map((assignmentType) => (
              <div
                key={assignmentType.id}
                className="relative w-36 shrink-0 overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              >
                <Link
                  to={`/app/assignment-types/${assignmentType.id}`}
                  className="group block"
                >
                  <AssignmentTypeImage
                    assignmentType={assignmentType}
                    className="h-20 w-full"
                  />
                  <div className="p-2.5 pr-10">
                    <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                      {assignmentType.title}
                    </h3>
                  </div>
                </Link>
                <Tooltip text={`New ${assignmentType.title} assignment`}>
                  <Link
                    to={`/app/assignments?create=1&assignmentType=${assignmentType.id}`}
                    aria-label={`New ${assignmentType.title} assignment`}
                    className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-black/10 transition-colors hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden" aria-hidden="true" />
                  </Link>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No assignment types are available yet. Use New assignment to get
            started.
          </p>
        </div>
      )}
    </div>
  );
}
