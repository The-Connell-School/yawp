import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

export type ApEnglishLitLibraryEntry = {
  externalKey: string;
  title: string;
  prompt: string;
  frqType: string;
  focusSkill: string;
  difficulty: string | null;
  suggestedWorks: string | null;
  sources: Array<unknown>;
};

type Props = {
  entries: ApEnglishLitLibraryEntry[];
  onSelectEntry: (entry: ApEnglishLitLibraryEntry) => void;
};

const FRQ_TYPE_LABEL: Record<string, string> = {
  poetry: 'Poetry',
  prose: 'Prose',
  literary_argument: 'Literary Argument',
};

function frqLabel(value: string) {
  return FRQ_TYPE_LABEL[value] ?? value;
}

function humanize(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function countSuggestedWorks(value: string | null): number {
  if (!value) return 0;
  return value.split('\n').filter((line) => line.trim().length > 0).length;
}

export function ApEnglishLitLibrary({ entries, onSelectEntry }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">AP Literature Prompt Library</h2>
        <span className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No AP Literature prompts have been published yet.
        </div>
      ) : null}

      <div className="grid gap-3">
        {entries.map((entry) => {
          const isOpenQuestion = entry.frqType === 'literary_argument';
          const worksCount = countSuggestedWorks(entry.suggestedWorks);
          return (
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
                    {frqLabel(entry.frqType)}
                  </Badge>
                </div>

                <p className="line-clamp-3 whitespace-normal text-sm font-normal leading-6 text-muted-foreground">
                  {entry.prompt}
                </p>

                <div className="flex flex-wrap gap-2">
                  {humanize(entry.focusSkill) ? (
                    <Badge variant="outline" size="sm">
                      {humanize(entry.focusSkill)}
                    </Badge>
                  ) : null}
                  {humanize(entry.difficulty) ? (
                    <Badge variant="outline" size="sm">
                      {humanize(entry.difficulty)}
                    </Badge>
                  ) : null}
                  {isOpenQuestion ? (
                    <Badge variant="outline" size="sm">
                      {worksCount > 0
                        ? `${worksCount} suggested ${
                            worksCount === 1 ? 'work' : 'works'
                          }`
                        : 'Choose your own work'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" size="sm">
                      {entry.sources.length}{' '}
                      {entry.sources.length === 1 ? 'text' : 'texts'}
                    </Badge>
                  )}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
