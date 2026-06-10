import { CheckCircle2, ClipboardCheck, ClipboardList, Send } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';

export function TeacherWorkspaceCards({
  assignmentsEnabled,
  assignmentsCount,
  needsGradingCount,
  readyToReleaseCount,
}: {
  assignmentsEnabled: boolean;
  assignmentsCount: number;
  needsGradingCount: number;
  readyToReleaseCount: number;
}) {
  const allCaughtUp = needsGradingCount === 0 && readyToReleaseCount === 0;
  const gradingTo = allCaughtUp
    ? '/app/student-work'
    : '/app/student-work?status=needs-grading';

  return (
    <div
      data-testid="teacher-workspace-cards"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {assignmentsEnabled ? (
        <Link
          to="/app/assignments"
          className="flex items-start gap-3 rounded-lg border bg-background p-4 transition-shadow hover:shadow"
        >
          <div className="rounded-md border bg-muted p-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Assignments</h3>
              <Badge variant="secondary" size="sm">
                {assignmentsCount}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Create assignments and apply them to your classes.
            </p>
          </div>
        </Link>
      ) : null}

      <Link
        to={gradingTo}
        className="flex items-start gap-3 rounded-lg border bg-background p-4 transition-shadow hover:shadow"
      >
        <div className="rounded-md border bg-muted p-2">
          <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Grading</h3>
          {allCaughtUp ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              All caught up
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {needsGradingCount > 0 ? (
                <Badge className="gap-1 border-orange-200 bg-orange-100 text-orange-700">
                  <ClipboardCheck className="h-3 w-3" />
                  {needsGradingCount} to grade
                </Badge>
              ) : null}
              {readyToReleaseCount > 0 ? (
                <Badge className="gap-1 border-blue-200 bg-blue-100 text-blue-700">
                  <Send className="h-3 w-3" />
                  {readyToReleaseCount} to release
                </Badge>
              ) : null}
            </div>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Review, grade, and release student work.
          </p>
        </div>
      </Link>
    </div>
  );
}
