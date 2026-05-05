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
import type { CourseOption } from '../route';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypeName: string;
  assignmentTypeId: string;
  courses: CourseOption[];
};

export function CreateAssignmentForm({
  open,
  onOpenChange,
  assignmentTypeName,
  assignmentTypeId,
  courses,
}: Props) {
  const fetcher = useFetcher();
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');

  const isLoading = fetcher.state !== 'idle';

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId],
    );
  }

  function handleSubmit() {
    if (selectedCourseIds.length === 0) return;
    fetcher.submit(
      { assignmentTypeId, courseIds: selectedCourseIds, dueDate },
      { method: 'POST', action: '/api/assignments/create', encType: 'application/json' },
    );
    onOpenChange(false);
    setSelectedCourseIds([]);
    setDueDate('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Assignment: {assignmentTypeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div>
            <p className="text-sm font-medium mb-2">Assign to:</p>
            <div className="space-y-2.5">
              {courses.map((course) => (
                <div key={course.id} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`course-${course.id}`}
                    checked={selectedCourseIds.includes(course.id)}
                    onCheckedChange={() => toggleCourse(course.id)}
                  />
                  <Label
                    htmlFor={`course-${course.id}`}
                    className="font-normal cursor-pointer"
                  >
                    {course.name}
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
            disabled={selectedCourseIds.length === 0 || isLoading}
            isLoading={isLoading}
          >
            Create Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
