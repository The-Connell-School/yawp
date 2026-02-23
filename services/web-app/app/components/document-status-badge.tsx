import { Badge } from '~/components/ui/badge';

type Props = {
  submittedAt: Date | string | null | undefined;
  grade?:
    | {
        releasedAt: Date | string | null | undefined;
      }
    | null
    | undefined;
};

export function getDocumentStatusLabel({
  submittedAt,
  grade,
}: Props): 'Draft' | 'Submitted' | 'Returned' | 'Graded' {
  const isSubmitted = submittedAt !== null && submittedAt !== undefined;
  const hasGrade = grade !== null && grade !== undefined;
  const isReleased =
    grade?.releasedAt !== null && grade?.releasedAt !== undefined;

  if (!isSubmitted) return 'Draft';
  if (!hasGrade) return 'Submitted';
  if (isReleased) return 'Returned';
  return 'Graded';
}

export function DocumentStatusBadge({ submittedAt, grade }: Props) {
  const label = getDocumentStatusLabel({ submittedAt, grade });

  if (label === 'Returned') {
    return (
      <Badge variant="success" className="text-xs">
        {label}
      </Badge>
    );
  }

  if (label === 'Submitted') {
    return (
      <Badge variant="info-outlined" className="text-xs">
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-xs">
      {label}
    </Badge>
  );
}

