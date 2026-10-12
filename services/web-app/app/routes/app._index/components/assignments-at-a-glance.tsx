import { Lock, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Tooltip } from '~/components/ui/tooltip';
import type { LockedAssignmentTypeTeaser } from '~/domain/free-tier/locked-assignment-types';
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

/**
 * A type the teacher's free classroom doesn't include: grayed out, with a
 * lock where a free tile has its + button. It opens the type's guide as a
 * teaser rather than the type itself.
 */
function LockedAssignmentTypeTile({
  teaser,
}: {
  teaser: LockedAssignmentTypeTeaser;
}) {
  return (
    <Tooltip text="Included with a paid plan">
      <Link
        to={`/app/assignment-type-previews/${teaser.slug}`}
        data-locked="true"
        aria-label={`${teaser.title}, included with a paid plan. See how it works.`}
        className="group relative block w-36 shrink-0 overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
      >
        <img
          src={teaser.image}
          alt=""
          className="h-20 w-full object-cover opacity-50 grayscale transition group-hover:opacity-75"
        />
        <div className="p-2.5 pr-10">
          <h3 className="line-clamp-2 text-sm font-medium text-muted-foreground">
            {teaser.title}
          </h3>
        </div>
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-black/10"
        >
          <Lock className="h-3.5 w-3.5" />
        </span>
      </Link>
    </Tooltip>
  );
}

export function AssignmentsAtAGlance({
  assignmentTypes,
  lockedAssignmentTypes = [],
  onCreateAssignment,
  onCreateAssignmentForType,
  writingPracticeTo,
}: {
  assignmentTypes: AssignmentTypeGlanceRow[];
  /** Paid types a free classroom teacher sees grayed out, after the rest. */
  lockedAssignmentTypes?: LockedAssignmentTypeTeaser[];
  onCreateAssignment: () => void;
  onCreateAssignmentForType: (assignmentTypeId: string) => void;
  /** When set, shows a Writing Fundamentals Practice tile that links here. */
  writingPracticeTo?: string;
}) {
  const hasTiles =
    assignmentTypes.length > 0 ||
    lockedAssignmentTypes.length > 0 ||
    Boolean(writingPracticeTo);

  return (
    <div data-testid="teacher-assignments-grid" data-tour="dashboard-assignments">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Assignments</h2>
        <button
          type="button"
          onClick={onCreateAssignment}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New assignment
        </button>
      </div>

      {hasTiles ? (
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex w-max gap-3 pb-1">
            {writingPracticeTo ? (
              <Link
                to={writingPracticeTo}
                className="group relative flex w-36 shrink-0 flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              >
                <img
                  src="/img/writing-fundamentals-cafe-cat.png"
                  alt=""
                  data-testid="writing-fundamentals-tile-image"
                  className="h-20 w-full object-cover object-center"
                />
                <div className="p-2.5">
                  <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                    Writing Fundamentals Practice
                  </h3>
                </div>
              </Link>
            ) : null}
            {assignmentTypes.map((assignmentType) => (
              <div
                key={assignmentType.id}
                data-locked="false"
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
                  <button
                    type="button"
                    onClick={() => onCreateAssignmentForType(assignmentType.id)}
                    aria-label={`New ${assignmentType.title} assignment`}
                    className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-black/10 transition-colors hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                    <span
                      className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                      aria-hidden="true"
                    />
                  </button>
                </Tooltip>
              </div>
            ))}
            {lockedAssignmentTypes.map((teaser) => (
              <LockedAssignmentTypeTile key={teaser.slug} teaser={teaser} />
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
