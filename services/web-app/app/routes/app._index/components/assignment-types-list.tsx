import { Link, useFetcher } from 'react-router';
import { Trash2Icon } from 'lucide-react';
import { Button } from '~/components/ui/button';
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
          <p className="text-muted-foreground text-sm">No assignment types yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Assignment Types</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {assignmentTypes.map((at) => (
          <div key={at.id} className="relative">
            <Link
              to={`/app/my-classes/${at.id}`}
              className="flex flex-col rounded-lg border transition-shadow hover:shadow bg-muted"
            >
              {at.image ? (
                <img
                  src={`/api/image/assignment-type/${at.image.id}`}
                  alt=""
                  className="h-32 w-full rounded-t-lg object-cover"
                />
              ) : (
                <div className="h-32 w-full rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20" />
              )}
              <div className="max-w-42 flex items-center justify-between p-3">
                <h4 className="text-foreground/90">{at.name}</h4>
              </div>
            </Link>
            {at.isOrphan && (
              <div className="absolute top-2 right-2">
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
                  <Button variant="destructive-outline" size="icon-sm">
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmationDialog>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
