import { Link } from 'react-router';
import type { AssignmentTypeRow } from '../route';

export function AssignmentTypesList({
  assignmentTypes,
}: {
  assignmentTypes: AssignmentTypeRow[];
}) {
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
          <Link
            key={at.id}
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
            <div className="p-3">
              <h4 className="text-foreground/90">{at.name}</h4>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
