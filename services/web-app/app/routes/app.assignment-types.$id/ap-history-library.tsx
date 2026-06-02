import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

export type ApHistoryLibraryEntry = {
  externalKey: string;
  title: string;
  prompt: string;
  essayType: string;
  period: string;
  reasoningSkill: string;
  difficulty: string | null;
  sources: Array<unknown>;
};

type Props = {
  entries: ApHistoryLibraryEntry[];
  onSelectEntry: (entry: ApHistoryLibraryEntry) => void;
};

function label(value: string | null | undefined) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ApHistoryLibrary({ entries, onSelectEntry }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">APUSH Prompt Library</h2>
        <span className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No APUSH prompts have been published yet.
        </div>
      ) : null}

      <div className="grid gap-3">
        {entries.map((entry) => (
          <Button
            key={entry.externalKey}
            type="button"
            variant="unstyled"
            className="h-auto w-full rounded-lg border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground"
            onClick={() => onSelectEntry(entry)}
          >
            <div className="flex w-full flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="text-base font-semibold leading-snug">
                  {entry.title}
                </h3>
                <Badge variant="secondary" size="sm" className="w-fit">
                  {entry.essayType.toUpperCase()}
                </Badge>
              </div>

              <p className="line-clamp-3 whitespace-normal text-sm font-normal leading-6 text-muted-foreground">
                {entry.prompt}
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" size="sm">
                  {entry.period}
                </Badge>
                <Badge variant="outline" size="sm">
                  {entry.reasoningSkill}
                </Badge>
                {label(entry.difficulty) ? (
                  <Badge variant="outline" size="sm">
                    {label(entry.difficulty)}
                  </Badge>
                ) : null}
                <Badge variant="outline" size="sm">
                  {entry.sources.length}{' '}
                  {entry.sources.length === 1 ? 'source' : 'sources'}
                </Badge>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </section>
  );
}
