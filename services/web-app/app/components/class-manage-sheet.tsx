import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { generateClassCode } from '~/utils/class';

export type ClassManageRow = {
  id: string;
  schoolId: string;
  schoolYear: string;
  grade: string;
  period: string | null;
  title: string | null;
  code: string;
};

function defaultSchoolYear() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

export function ClassManageSheet({
  open,
  onOpenChange,
  editingClass,
  schools,
  actionUrl = '/app/my-classes?index',
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass: ClassManageRow | null;
  schools: { id: string; name: string }[];
  actionUrl?: string;
  onSuccess?: () => void;
}) {
  const fetcher = useFetcher({
    key: editingClass ? `edit-${editingClass.id}` : 'create',
  });
  const [schoolId, setSchoolId] = useState('');
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [grade, setGrade] = useState('');
  const [period, setPeriod] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState(generateClassCode());

  useEffect(() => {
    if (editingClass) {
      setSchoolId(editingClass.schoolId);
      setSchoolYear(editingClass.schoolYear);
      setGrade(editingClass.grade);
      setPeriod(editingClass.period ?? '');
      setTitle(editingClass.title || '');
      setCode(editingClass.code);
      return;
    }

    setSchoolId(schools[0]?.id || '');
    setSchoolYear(defaultSchoolYear());
    setGrade('');
    setPeriod('');
    setTitle('');
    setCode(generateClassCode());
  }, [editingClass, open, schools]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) {
      onOpenChange(false);
      onSuccess?.();
    }
  }, [fetcher.state, fetcher.data, onOpenChange, onSuccess]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append('intent', editingClass ? 'edit-class' : 'create-class');
    if (editingClass) formData.append('classId', editingClass.id);
    formData.append('schoolId', schoolId);
    formData.append('schoolYear', schoolYear);
    formData.append('grade', grade);
    formData.append('period', period);
    formData.append('title', title);
    formData.append('code', code);
    fetcher.submit(formData, { method: 'POST', action: actionUrl });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editingClass ? 'Edit Class' : 'Create Class'}</SheetTitle>
          <SheetDescription>
            {editingClass
              ? 'Update class details for your roster.'
              : 'Create a new class and add yourself as the teacher.'}
          </SheetDescription>
        </SheetHeader>

        {fetcher.data?.error ? (
          <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {fetcher.data.error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>School</Label>
            <Select value={schoolId} onValueChange={setSchoolId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a school" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Class Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={10}
              required
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>School Year</Label>
            <Input
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              placeholder="2025-2026"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Grade</Label>
              <Select value={grade} onValueChange={setGrade} required>
                <SelectTrigger>
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  {['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod} required>
                <SelectTrigger>
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4', '5', '6', '7', '8'].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Class Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="AP English 11"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {fetcher.state !== 'idle'
                ? 'Saving...'
                : editingClass
                  ? 'Update Class'
                  : 'Create Class'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
