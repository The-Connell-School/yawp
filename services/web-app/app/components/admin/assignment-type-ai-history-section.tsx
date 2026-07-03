import { FlaskConical, HistoryIcon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

export type AssignmentTypeAiVersionRow = {
  id: string;
  versionNumber: number;
  changeSource: string;
  changeSummary: string | null;
  createdAt: Date | string;
  createdByUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

function formatVersionDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSource(source: string) {
  if (source.includes('assignment-module-instruction')) {
    return 'Tutor instruction';
  }
  if (source.includes('assignment-module')) {
    return 'Tutor module';
  }
  if (source.includes('assignment-type')) {
    return 'Assignment type';
  }
  return source;
}

function actorLabel(version: AssignmentTypeAiVersionRow) {
  return (
    version.createdByUser?.name ??
    version.createdByUser?.email ??
    'Unknown admin'
  );
}

export function AssignmentTypeAiHistorySection({
  assignmentTypeId,
  aiVersions,
}: {
  assignmentTypeId: string;
  aiVersions: AssignmentTypeAiVersionRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">AI change history</h3>
        </div>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={`/app/admin/assignment-types/${assignmentTypeId}/ai-workbench`}>
            <FlaskConical className="mr-2 size-4" />
            Open workbench
          </a>
        </Button>
      </div>

      {aiVersions.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No AI snapshots have been recorded yet.
        </div>
      ) : (
        <ol className="space-y-3">
          {aiVersions.map((version) => (
            <li key={version.id} className="rounded-md border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" size="sm">
                      v{version.versionNumber}
                    </Badge>
                    <span className="text-sm font-medium">
                      {version.changeSummary ?? 'AI configuration updated'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatSource(version.changeSource)} by {actorLabel(version)}
                  </p>
                </div>
                <time
                  dateTime={new Date(version.createdAt).toISOString()}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {formatVersionDate(version.createdAt)}
                </time>
              </div>
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" asChild>
                  <a
                    href={`/app/admin/assignment-types/${assignmentTypeId}/ai-workbench?versionId=${version.id}`}
                  >
                    Replay
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
