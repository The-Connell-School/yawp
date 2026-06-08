import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import type { AssignmentTypeRow, TeacherClassOption } from '../route';
import { DashboardCreateAssignmentSheet } from './dashboard-create-assignment-sheet';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

export function getGenericAssignmentTypes(
  assignmentTypes: AssignmentTypeRow[]
) {
  return assignmentTypes.filter(
    (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
  );
}

export function AssignmentTypesList({
  assignmentTypes,
  teacherClasses,
  assignmentCreationStandardizationEnabled,
}: {
  assignmentTypes: AssignmentTypeRow[];
  teacherClasses: TeacherClassOption[];
  assignmentCreationStandardizationEnabled: boolean;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const genericAssignmentTypes = getGenericAssignmentTypes(assignmentTypes);
  const canCreate =
    genericAssignmentTypes.length > 0 && teacherClasses.length > 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Assignment Types</h2>
        <Button
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          disabled={!canCreate}
        >
          Create Assignment
        </Button>
      </div>
      {assignmentTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No assignment types yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {assignmentTypes.map((at) => (
            <Link
              key={at.id}
              to={`/app/assignment-types/${at.id}`}
              className="flex flex-col rounded-lg border transition-shadow hover:shadow bg-muted"
            >
              {at.image ? (
                <img
                  src={`/api/image/course/${at.image.id}`}
                  alt=""
                  className="h-32 w-full rounded-t-lg object-cover"
                />
              ) : (
                <div className="h-32 w-full rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20" />
              )}
              <div className="p-3">
                <h4 className="text-foreground/90">{at.title}</h4>
              </div>
            </Link>
          ))}
        </div>
      )}
      <DashboardCreateAssignmentSheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        assignmentTypes={genericAssignmentTypes}
        teacherClasses={teacherClasses}
        assignmentCreationStandardizationEnabled={
          assignmentCreationStandardizationEnabled
        }
      />
    </div>
  );
}
