import { Link } from 'react-router';
import { ChevronRightIcon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import type { TrainingRow } from '../route';

function TrainingStatusBadge({ status }: { status: TrainingRow['status'] }) {
  if (status === 'completed')
    return (
      <Badge variant="success" size="sm">
        Completed
      </Badge>
    );
  if (status === 'in-progress')
    return (
      <Badge variant="info-outlined" size="sm">
        In progress
      </Badge>
    );
  return (
    <Badge variant="secondary" size="sm">
      Not started
    </Badge>
  );
}

export function TrainingList({ training }: { training: TrainingRow[] }) {
  if (training.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">No training modules available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border divide-y overflow-hidden">
      {training.map((item) => (
        <Link
          key={item.id}
          to={`/app/teacher-courses/${item.id}`}
          className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <p className="font-medium text-sm">{item.name}</p>
            <TrainingStatusBadge status={item.status} />
          </div>
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
