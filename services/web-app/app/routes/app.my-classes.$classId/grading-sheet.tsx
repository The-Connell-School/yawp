import { useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Checkbox } from '~/components/ui/checkbox';
import { Badge } from '~/components/ui/badge';

type Document = {
  id: string;
  title: string;
  submittedSnapshotId: string | null;
  profile: {
    user: {
      name: string | null;
      email: string;
    };
  };
  submittedSnapshot?: {
    id: string;
    grades: {
      id: string;
      score: string | null;
      feedback: string | null;
      releasedAt: string | null;
    }[];
  } | null;
};

type GradingSheetProps = {
  documents: Document[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function GradingSheet({ documents, isOpen, onClose, onSuccess }: GradingSheetProps) {
  const fetcher = useFetcher();
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [releaseImmediately, setReleaseImmediately] = useState(false);

  const isMultiple = documents.length > 1;
  const existingGrade = !isMultiple ? documents[0]?.submittedSnapshot?.grades?.[0] : null;
  const isEditing = !isMultiple && existingGrade;

  // Initialize form with existing grade data when editing
  useState(() => {
    if (isEditing && existingGrade) {
      setScore(existingGrade.score || '');
      setFeedback(existingGrade.feedback || '');
      setReleaseImmediately(!!existingGrade.releasedAt);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();

    if (isEditing) {
      // Update existing grade
      formData.append('gradeId', existingGrade!.id);
      formData.append('score', score);
      formData.append('feedback', feedback);

      fetcher.submit(formData, {
        method: 'POST',
        action: '/api/domain/update-grade',
      });
    } else {
      // Create new grade(s)
      documents.forEach(doc => {
        formData.append('documentIds', doc.id);
      });
      formData.append('score', score);
      formData.append('feedback', feedback);
      if (releaseImmediately) {
        formData.append('releaseImmediately', 'on');
      }

      fetcher.submit(formData, {
        method: 'POST',
        action: '/api/domain/grade-essay',
      });
    }
  };

  // Reset form and close when submission is successful
  useState(() => {
    if (fetcher.data?.success && fetcher.state === 'idle') {
      setScore('');
      setFeedback('');
      setReleaseImmediately(false);
      onClose();
      onSuccess?.();
    }
  });

  const title = isEditing
    ? 'Edit Grade'
    : isMultiple
      ? `Grade ${documents.length} Essays`
      : 'Grade Essay';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isMultiple
              ? 'Enter the same grade and feedback for all selected essays.'
              : isEditing
                ? 'Update the grade and feedback for this essay.'
                : 'Enter grade and feedback for this essay.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Show list of essays being graded */}
          {isMultiple && (
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="text-sm font-medium">Essays to Grade:</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {doc.profile.user.name || doc.profile.user.email}
                    </span>
                    <span className="font-medium truncate ml-2">{doc.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show single essay details */}
          {!isMultiple && documents[0] && (
            <div className="rounded-lg border p-4 space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Student: </span>
                <span className="text-sm font-medium">
                  {documents[0].profile.user.name || documents[0].profile.user.email}
                </span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Essay: </span>
                <span className="text-sm font-medium">{documents[0].title}</span>
              </div>
              {existingGrade && (
                <div className="pt-2 border-t">
                  <Badge variant={existingGrade.releasedAt ? 'default' : 'secondary'}>
                    {existingGrade.releasedAt ? 'Released' : 'Not Released'}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Grading form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="score">
                Score/Grade <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="score"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="e.g., A+, 95/100, Excellent"
                disabled={fetcher.state !== 'idle'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback">
                Feedback <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter your feedback for the student..."
                rows={8}
                disabled={fetcher.state !== 'idle'}
              />
              <p className="text-xs text-muted-foreground">
                {isMultiple
                  ? 'This feedback will be applied to all selected essays.'
                  : 'Provide constructive feedback to help the student improve.'}
              </p>
            </div>

            {!isEditing && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="release"
                  checked={releaseImmediately}
                  onCheckedChange={(checked) => setReleaseImmediately(checked === true)}
                  disabled={fetcher.state !== 'idle'}
                />
                <Label
                  htmlFor="release"
                  className="text-sm font-normal cursor-pointer"
                >
                  Release grade to {isMultiple ? 'students' : 'student'} immediately
                </Label>
              </div>
            )}

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
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
                {fetcher.state !== 'idle'
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Grade'
                    : isMultiple
                      ? `Grade ${documents.length} Essays`
                      : 'Save Grade'}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
