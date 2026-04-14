import { Badge } from '~/components/ui/badge';
import { Tooltip } from '~/components/ui/tooltip';

type Props = {
  archivedAt: Date | string | null | undefined;
};

export function StudentArchiveCell({ archivedAt }: Props) {
  if (!archivedAt) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Tooltip
      text="The student hid this submission from their own list. You can still grade and release as usual."
      delayDuration={300}
    >
      <span className="inline-flex">
        <Badge
          variant="outline"
          data-testid="student-archived-indicator"
          className="border-amber-200 bg-amber-50 font-normal text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Archived
        </Badge>
      </span>
    </Tooltip>
  );
}
