import type { MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { badgeVariants } from '~/components/ui/badge';
import { cn } from '~/utils/misc';

export function assignmentDocumentsLabel(count: number) {
  return `${count} ${count === 1 ? 'doc' : 'docs'}`;
}

export function AssignmentDocumentsPill({
  documentCount,
  onClick,
  ariaLabel,
  testId,
}: {
  documentCount: number;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        badgeVariants({ variant: 'secondary' }),
        'cursor-pointer gap-1 py-1 pl-2 pr-1'
      )}
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {assignmentDocumentsLabel(documentCount)}
      <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
    </button>
  );
}
