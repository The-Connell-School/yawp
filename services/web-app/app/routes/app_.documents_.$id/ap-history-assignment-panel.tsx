import { Badge } from '~/components/ui/badge';
import { ApHistorySourceCard } from '~/components/ap-history/source-card';
import type { ApHistorySnapshot } from '~/domain/ap-history/schema';

type Props = {
  snapshot: ApHistorySnapshot;
};

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ApHistoryAssignmentPanel({ snapshot }: Props) {
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
            <div className="mt-2 grid max-h-[min(20rem,35vh)] gap-2 overflow-y-auto pr-1">
              {[...snapshot.sources]
                .sort((a, b) => a.position - b.position)
                .map((source) => (
                  <ApHistorySourceCard
                    key={`${source.position}-${source.externalKey}`}
                    source={source}
                  />
                ))}
            </div>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
