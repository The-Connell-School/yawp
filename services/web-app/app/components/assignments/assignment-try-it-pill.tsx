import { Link, useLocation } from 'react-router';
import { buildAssignmentTryItHref } from '~/domain/assignments/teacher-assignment-try-it-href';
import { cn } from '~/utils/misc';

export { buildAssignmentTryItHref } from '~/domain/assignments/teacher-assignment-try-it-href';

export function AssignmentTryItPill({
  assignment,
  className,
}: {
  assignment: { id: string; assignmentTypeId?: string | null; classId?: string | null };
  className?: string;
}) {
  const location = useLocation();
  const href = buildAssignmentTryItHref(assignment, {
    returnTo: `${location.pathname}${location.search}`,
  });
  const pillClassName = cn(
    'inline-flex h-6 shrink-0 items-center rounded-full border border-primary/40 bg-background px-2.5 text-xs font-medium text-primary hover:bg-primary/10',
    className
  );

  return (
    <Link
      to={href}
      className={pillClassName}
      data-testid="assignment-try-it-pill"
      onClick={(event) => event.stopPropagation()}
    >
      Try it
    </Link>
  );
}
