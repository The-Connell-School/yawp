import { Link, useFetcher } from 'react-router';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import type { AssignmentTypeRow } from '../route';

export function AssignmentTypesList({
  assignmentTypes,
}: {
  assignmentTypes: AssignmentTypeRow[];
}) {
  const fetcher = useFetcher();

  if (assignmentTypes.length === 0) {
    return (
      <div>
        <h2 className="text-base font-semibold mb-3">Assignment Types</h2>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm mb-4">No assignment types yet.</p>
          <Button size="sm" asChild>
            <Link to="/app/my-classes/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              Create your first assignment type
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Assignment Types</h2>
      <div className="rounded-lg border divide-y overflow-hidden">
        {assignmentTypes.map((at) => (
          <div
            key={at.id}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <Link to={`/app/my-classes/${at.id}`} className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm">{at.name}</span>
                {at.isOrphan && (
                  <Badge variant="secondary" size="sm">
                    Not yet assigned
                  </Badge>
                )}
              </div>
              {!at.isOrphan && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {at.courseCount} {at.courseCount === 1 ? 'course' : 'courses'} ·{' '}
                  {at.studentCount} students assigned
                </p>
              )}
            </Link>
            {at.isOrphan && (
              <ConfirmationDialog
                title="Delete assignment type"
                description={`Are you sure you want to delete "${at.name}"? This cannot be undone.`}
                confirmText="Delete"
                variant="destructive"
                onConfirm={() => {
                  fetcher.submit(
                    { assignmentTypeId: at.id },
                    { method: 'DELETE', action: `/api/assignment-types/${at.id}/delete` },
                  );
                }}
              >
                <Button variant="destructive-outline" size="sm">
                  <Trash2Icon className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              </ConfirmationDialog>
            )}
          </div>
        ))}
        <div className="px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <Link to="/app/my-classes/new">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Create new assignment type
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
