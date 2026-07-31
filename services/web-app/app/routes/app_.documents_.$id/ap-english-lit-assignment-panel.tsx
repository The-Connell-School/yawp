import { Badge } from '~/components/ui/badge';
import type { ApEnglishLitSnapshot } from '~/domain/ap-english-lit/schema';

type Props = {
  snapshot: ApEnglishLitSnapshot;
};

const FRQ_TYPE_LABEL: Record<string, string> = {
  poetry: 'Poetry Analysis',
  prose: 'Prose Fiction Analysis',
  literary_argument: 'Literary Argument',
};

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ApEnglishLitAssignmentPanel({ snapshot }: Props) {
  const sourceCount = snapshot.sources.length;
  const hasSuggestedWorks = snapshot.suggestedWorks.length > 0;

  return (
    <aside className="mx-auto w-full max-w-screen-2xl border-b bg-slate-50 px-3 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" size="sm">
            {FRQ_TYPE_LABEL[snapshot.frqType] ?? snapshot.frqType}
          </Badge>
          <Badge variant="outline" size="sm">
            AP Literature
          </Badge>
          <Badge variant="outline" size="sm">
            {titleCase(snapshot.focusSkill)}
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
          <details className="group" open>
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              {snapshot.frqType === 'poetry' ? 'Poem' : 'Passage'}
            </summary>
            <div className="mt-2 grid max-h-[min(24rem,40vh)] gap-2 overflow-y-auto pr-1">
              {snapshot.sources.map((source) => (
                <section
                  key={`${source.position}-${source.externalKey}`}
                  className="rounded-md border bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
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
        ) : hasSuggestedWorks ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              Suggested works
            </summary>
            <div className="mt-2 rounded-md border bg-white p-3">
              <p className="text-xs text-muted-foreground">
                Choose one of these works of literary merit, or another you know
                well:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
                {snapshot.suggestedWorks.map((work) => (
                  <li key={work}>{work}</li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
