import { useState } from 'react';
import { Maximize2Icon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { ApEnglishLangSnapshot } from '~/domain/ap-english-lang/schema';
import {
  SourceReaderDialog,
  type ReadableSource,
} from './source-reader-dialog';

type Props = {
  snapshot: ApEnglishLangSnapshot;
};

const FRQ_TYPE_LABELS: Record<string, string> = {
  synthesis: 'Synthesis',
  rhetorical_analysis: 'Rhetorical Analysis',
  argument: 'Argument',
};

const SOURCE_LABELS: Record<string, string> = {
  synthesis: 'source',
  rhetorical_analysis: 'passage',
  argument: 'source',
};

export function ApEnglishLangAssignmentPanel({ snapshot }: Props) {
  const sourceCount = snapshot.sources.length;
  const sourceLabel = SOURCE_LABELS[snapshot.frqType] ?? 'source';
  // The source currently open in the fullscreen reader, if any, with the
  // designation ("Source A", "Source 1") it carries in the strip.
  const [reader, setReader] = useState<{
    source: ReadableSource;
    designation: string;
  } | null>(null);

  return (
    <aside className="mx-auto w-full max-w-screen-2xl border-b bg-slate-50 px-3 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" size="sm">
            {FRQ_TYPE_LABELS[snapshot.frqType] ?? snapshot.frqType}
          </Badge>
          <Badge variant="outline" size="sm">
            {snapshot.focusSkill}
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
          <details className="group" open={snapshot.frqType === 'rhetorical_analysis'}>
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              {sourceCount} {sourceCount === 1 ? sourceLabel : `${sourceLabel}s`}
            </summary>
            <div className="mt-2 grid max-h-[min(20rem,35vh)] gap-2 overflow-y-auto pr-1">
              {snapshot.sources.map((source) => {
                const designation =
                  snapshot.frqType === 'synthesis'
                    ? `Source ${String.fromCharCode(64 + source.position)}`
                    : snapshot.frqType === 'rhetorical_analysis'
                      ? `Passage ${source.position}`
                      : `Source ${source.position}`;
                return (
                <section
                  key={`${source.position}-${source.externalKey}`}
                  className="rounded-md border bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" size="sm">
                      {designation}
                    </Badge>
                    <h3 className="text-sm font-semibold">{source.title}</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 gap-1 px-2 text-xs"
                      onClick={() => setReader({ source, designation })}
                    >
                      <Maximize2Icon className="h-3.5 w-3.5" />
                      Full screen
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.attribution}
                  </p>
                  {source.caption ? (
                    <p className="mt-2 text-sm italic text-muted-foreground">
                      {source.caption}
                    </p>
                  ) : null}
                  {source.mediaType === 'image' && source.imageAlt ? (
                    <p className="mt-2 text-sm font-medium text-muted-foreground">
                      [Visual source] {source.imageAlt}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {source.body}
                  </p>
                </section>
                );
              })}
            </div>
          </details>
        ) : null}

        {snapshot.suggestedEvidence.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Suggested evidence domains
            </p>
            <ul className="list-inside list-disc text-sm leading-6 text-foreground">
              {snapshot.suggestedEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <SourceReaderDialog
        source={reader?.source ?? null}
        sourceDesignation={reader?.designation ?? ''}
        onClose={() => setReader(null)}
      />
    </aside>
  );
}
