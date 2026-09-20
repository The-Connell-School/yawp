import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type {
  DocumentNavigationNeighbors,
  DocumentNavigationEntry,
} from '~/domain/grading/grading-queue';

export function TeacherDocumentNavigation({
  queue,
  documentId,
  hrefFor,
  disabled = false,
}: {
  queue: DocumentNavigationNeighbors;
  documentId: string;
  hrefFor: (entry: DocumentNavigationEntry) => string;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const current = queue.entries.find((entry) => entry.documentId === documentId);
  const label = current?.studentName ?? 'document';
  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-testid="document-navigation"
      role="group"
      aria-label="Documents"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        data-testid="document-navigation-previous"
        aria-label={
          queue.previous
            ? `Previous document: ${queue.previous.studentName}, ${queue.previous.documentTitle}`
            : 'No previous document'
        }
        disabled={disabled || !queue.previous}
        onClick={() => queue.previous && navigate(hrefFor(queue.previous))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        aria-label={`Choose document for ${label}`}
        data-testid="document-navigation-select"
        className="h-8 min-w-0 max-w-[min(24rem,45vw)] rounded-md border border-input bg-background px-2 text-sm"
        value={documentId}
        disabled={disabled}
        onChange={(event) => {
          const entry = queue.entries.find(
            (candidate) => candidate.documentId === event.currentTarget.value
          );
          if (entry) navigate(hrefFor(entry));
        }}
      >
        {queue.entries.map((entry) => (
          <option key={entry.documentId} value={entry.documentId}>
            {entry.studentName} — {entry.documentTitle}
            {entry.status !== 'in-progress' ? ` (${entry.status})` : ''}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        data-testid="document-navigation-next"
        aria-label={
          queue.next
            ? `Next document: ${queue.next.studentName}, ${queue.next.documentTitle}`
            : 'No next document'
        }
        disabled={disabled || !queue.next}
        onClick={() => queue.next && navigate(hrefFor(queue.next))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span
        className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline"
        data-testid="document-navigation-position"
        aria-live="polite"
      >
        {queue.position} of {queue.total}
      </span>
    </div>
  );
}
