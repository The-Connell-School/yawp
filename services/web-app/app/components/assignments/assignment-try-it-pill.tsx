import { Link } from 'react-router';
import { cn } from '~/utils/misc';

/**
 * Teacher student-preview entry point. Full preview session mode is not wired
 * in this branch yet — see docs/superpowers/plans/2026-06-13-org-membership.md.
 */
// TODO(student-preview): replace stub href with the teacher try-as-student document route.
export function buildAssignmentTryItHref(_assignment: {
  id: string;
  assignmentTypeId?: string | null;
}): string | null {
  return null;
}

export function AssignmentTryItPill({
  assignment,
  className,
}: {
  assignment: { id: string; assignmentTypeId?: string | null };
  className?: string;
}) {
  const href = buildAssignmentTryItHref(assignment);
  const pillClassName = cn(
    'inline-flex h-6 shrink-0 items-center rounded-full border border-primary/40 bg-background px-2.5 text-xs font-medium text-primary',
    className
  );

  if (!href) {
    return (
      <span
        className={cn(pillClassName, 'cursor-not-allowed opacity-50')}
        aria-disabled="true"
        data-testid="assignment-try-it-pill-stub"
        title="Student preview coming soon"
      >
        Try it
      </span>
    );
  }

  return (
    <Link
      to={href}
      className={cn(pillClassName, 'hover:bg-primary/10')}
      data-testid="assignment-try-it-pill"
      onClick={(event) => event.stopPropagation()}
    >
      Try it
    </Link>
  );
}
