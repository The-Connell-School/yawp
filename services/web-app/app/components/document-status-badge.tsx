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

export function DocumentStatusBadge({ submittedAt, grade }: Props) {
  const isSubmitted = submittedAt !== null && submittedAt !== undefined;
  const hasGrade = grade !== null && grade !== undefined;
  const isReleased =
    grade?.releasedAt !== null && grade?.releasedAt !== undefined;

  if (!isSubmitted) {
    return (
      <Badge variant="secondary" className="text-xs">
        Draft
      </Badge>
    );
  }

  if (!hasGrade) {
    return (
      <Badge variant="info-outlined" className="text-xs">
        Submitted
      </Badge>
    );
  }

  if (isReleased) {
    return (
      <Badge variant="success" className="text-xs">
        Returned
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-xs">
      Graded
    </Badge>
  );
}

