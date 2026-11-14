import { Link, useLocation } from 'react-router';
import { buildAssignmentTryItHref } from '~/domain/assignments/teacher-assignment-try-it-href';
import { Button } from '~/components/ui/button';
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

  return (
    <Button
      asChild
      size="sm"
      variant="outline-primary"
      className={cn('h-6 shrink-0 rounded-full px-2.5 text-xs', className)}
    >
      <Link
        to={href}
        data-testid="assignment-try-it-pill"
        onClick={(event) => event.stopPropagation()}
      >
        Try it
      </Link>
    </Button>
  );
}