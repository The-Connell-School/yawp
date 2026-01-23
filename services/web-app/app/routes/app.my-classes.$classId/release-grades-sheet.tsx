import { useFetcher } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

type GradeWithDocument = {
  id: string;
  score: string | null;
  feedback: string | null;
  document: {
    id: string;
    title: string;
    profile: {
      user: {
        name: string | null;
        email: string;
      };
    };
  };
};

type ReleaseGradesSheetProps = {
  grades: GradeWithDocument[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ReleaseGradesSheet({ grades, isOpen, onClose, onSuccess }: ReleaseGradesSheetProps) {
  const fetcher = useFetcher();

  const handleRelease = () => {
    const formData = new FormData();
    grades.forEach(grade => {
      formData.append('gradeIds', grade.id);
    });

    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/release-grades',
    });
  };

  // Close and reload when submission is successful
  if (fetcher.data?.success && fetcher.state === 'idle') {
    onClose();
    onSuccess?.();
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Release Grades to Students</SheetTitle>
          <SheetDescription>
            Review the grades below before releasing them to students. Once released, students will be able to see their grades and feedback.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Essay</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Feedback Preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((grade) => (
                  <TableRow key={grade.id}>
                    <TableCell className="font-medium">
                      {grade.document.profile.user.name || grade.document.profile.user.email}
                    </TableCell>
                    <TableCell>{grade.document.title}</TableCell>
                    <TableCell>
                      {grade.score ? (
                        <Badge variant="secondary">{grade.score}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {grade.feedback || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {fetcher.data?.message && (
            <div
              className={`rounded-lg p-3 text-sm ${
                fetcher.data.success
                  ? 'bg-green-50 text-green-900 border border-green-200'
                  : 'bg-red-50 text-red-900 border border-red-200'
              }`}
            >
              {fetcher.data.message}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={fetcher.state !== 'idle'}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRelease}
              disabled={fetcher.state !== 'idle'}
            >
              {fetcher.state !== 'idle'
                ? 'Releasing...'
                : `Release ${grades.length} ${grades.length === 1 ? 'Grade' : 'Grades'}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
