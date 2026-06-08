import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import type { AssignmentTypeRow, TeacherClassOption } from '../route';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypes: AssignmentTypeRow[];
  teacherClasses: TeacherClassOption[];
  assignmentCreationStandardizationEnabled: boolean;
};

export function DashboardCreateAssignmentSheet({
  open,
  onOpenChange,
  assignmentTypes,
  teacherClasses,
  assignmentCreationStandardizationEnabled,
}: Props) {
  return (
    <AssignmentCreationSheet
      open={open}
      onOpenChange={onOpenChange}
      entryPoint="dashboard"
      assignmentTypes={assignmentTypes}
      teacherClasses={teacherClasses}
      assignmentCreationStandardizationEnabled={
        assignmentCreationStandardizationEnabled
      }
      emptyClassesMessage="You don't have any classes yet."
    />
  );
}
