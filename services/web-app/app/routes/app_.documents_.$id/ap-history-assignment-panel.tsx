import { Badge } from '~/components/ui/badge';
import { parseApHistorySnapshot } from '~/domain/ap-history/schema';

type Props = {
  snapshot: unknown;
};

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ApHistoryAssignmentPanel({ snapshot: rawSnapshot }: Props) {
  const snapshot = parseApHistorySnapshot(rawSnapshot);
  const sourceCount = snapshot.sources.length;

  return (
    <aside className="mx-auto w-full max-w-screen-2xl border-b bg-slate-50 px-3 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" size="sm">
            {snapshot.essayType.toUpperCase()}
          </Badge>
          <Badge variant="outline" size="sm">
            APUSH Period {snapshot.periodNumber}
          </Badge>
          <Badge variant="outline" size="sm">
            {titleCase(snapshot.reasoningSkill)}
          </Badge>
          <Badge variant="outline" size="sm">
            {snapshot.rubric.totalPoints} rubric points
          </Badge>
          <Badge variant="outline" size="sm">
            {snapshot.timing.mode === 'timed'
              ? `${snapshot.timing.durationMinutes} min`
              : `Untimed ${snapshot.timing.durationMinutes} min`}
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Prompt
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {snapshot.prompt}
          </p>
        </div>

        {sourceCount > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </summary>
            <div className="mt-2 grid gap-2">
              {snapshot.sources.map((source) => (
                <section
                  key={`${source.position}-${source.externalKey}`}
                  className="rounded-md border bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" size="sm">
                      Source {source.position}
                    </Badge>
                    <h3 className="text-sm font-semibold">{source.title}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.attribution}
                  </p>
                  {source.caption ? (
                    <p className="mt-2 text-sm italic text-muted-foreground">
                      {source.caption}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {source.body}
                  </p>
                </section>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
