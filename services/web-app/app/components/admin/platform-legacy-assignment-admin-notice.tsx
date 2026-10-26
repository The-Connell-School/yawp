import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '~/components/ui/button';

export function PlatformLegacyAssignmentAdminOffNotice() {
  return (
    <div className="rounded-lg border border-muted bg-muted/40 p-4 text-sm">
      <div className="font-semibold">Platform assignment-type admin is off in this environment.</div>
      <p className="mt-1 text-muted-foreground">
        Edit tutor instructions, modules, Give Me Feedback, and rubrics in Yawp
        Internal, or ask Bryant to enable the{' '}
        <code className="text-xs">platform_legacy_assignment_admin</code> feature
        flag for production.
      </p>
    </div>
  );
}

export function PlatformLegacyAssignmentAdminOnNotice({
  lastEditLine,
}: {
  lastEditLine?: string | null;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <div className="font-semibold">Platform assignment-type admin (legacy UI)</div>
      <p className="mt-1">
        You can edit here or in Yawp Internal — both use the same database
        records. Changes appear in either UI; last save wins.
      </p>
      {lastEditLine ? (
        <p className="mt-2 text-emerald-900/90">{lastEditLine}</p>
      ) : null}
      <p className="mt-2 text-emerald-900/90">
        Rubric categories and levels: open{' '}
        <strong>Grading assistant → Prompt</strong> on this assignment type, or
        pick a shared rubric above.
      </p>
    </div>
  );
}

export function PlatformLegacyAssignmentAdminListIntro() {
  return (
    <div className="mb-4 space-y-3">
      <PlatformLegacyAssignmentAdminOnNotice />
      <Button asChild>
        <Link to="/app/admin/assignment-types/new">
          <Plus className="mr-2 size-4 shrink-0" />
          Create assignment type
        </Link>
      </Button>
    </div>
  );
}
