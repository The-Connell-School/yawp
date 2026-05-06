import { useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import type { AssignmentTypeRow, TeacherClassOption } from '../route';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypes: AssignmentTypeRow[];
  teacherClasses: TeacherClassOption[];
};

export function DashboardCreateAssignmentDialog({
  open,
  onOpenChange,
  assignmentTypes,
  teacherClasses,
}: Props) {
  const fetcher = useFetcher();
  const [assignmentTypeId, setAssignmentTypeId] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');

  const isLoading = fetcher.state !== 'idle';
  const canSubmit = assignmentTypeId !== '' && selectedClassIds.length > 0;

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  function handleSubmit() {
    if (!canSubmit) return;
    fetcher.submit(
      { assignmentTypeId, classIds: selectedClassIds, dueDate },
      {
        method: 'POST',
        action: '/api/assignments/create',
        encType: 'application/json',
      }
    );
    onOpenChange(false);
    setAssignmentTypeId('');
    setSelectedClassIds([]);
    setDueDate('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div>
            <Label
              htmlFor="assignment-type"
              className="text-sm font-medium mb-1.5 block"
            >
              Assignment type
            </Label>
            <select
              id="assignment-type"
              value={assignmentTypeId}
              onChange={(e) => setAssignmentTypeId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Pick an assignment type</option>
              {assignmentTypes.map((at) => (
                <option key={at.id} value={at.id}>
                  {at.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Assign to:</p>
            <div className="space-y-2.5">
              {teacherClasses.map((klass) => (
                <div key={klass.id} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`class-${klass.id}`}
                    checked={selectedClassIds.includes(klass.id)}
                    onCheckedChange={() => toggleClass(klass.id)}
                  />
                  <Label
                    htmlFor={`class-${klass.id}`}
                    className="font-normal cursor-pointer"
                  >
                    {klass.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="due-date" className="text-sm font-medium">
              Due date
            </Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
            isLoading={isLoading}
          >
            Create Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
