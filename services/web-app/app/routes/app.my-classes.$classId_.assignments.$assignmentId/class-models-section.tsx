import { Link, useFetcher } from 'react-router';
import { ArrowUpRight, BookOpen, Sparkles, Wrench } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type {
  ClassModelExample,
  ClassModelFocus,
  ClassModelsSummary,
} from '~/domain/assignment-insights/select-class-models';

type ModelsData = { models: ClassModelsSummary | null; message?: string };

function ModelCard({
  kind,
  example,
  prompts,
  skill,
}: {
  kind: 'exemplar' | 'instructive';
  example: ClassModelExample;
  prompts: string[];
  skill: string;
}) {
  const isExemplar = kind === 'exemplar';
  const Icon = isExemplar ? Sparkles : Wrench;
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-l-4 bg-card p-3.5 ${
        isExemplar ? 'border-l-green-500' : 'border-l-orange-500'
      }`}
      data-testid={`class-models-${kind}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${
            isExemplar
              ? 'text-green-600 dark:text-green-400'
              : 'text-orange-600 dark:text-orange-400'
          }`}
          aria-hidden
        />
        <span className="text-sm font-semibold">
          {isExemplar ? 'Show what works' : 'Learn from together'}
        </span>
      </div>
      <p className="rounded-md bg-muted/40 p-2.5 text-base/7 italic text-foreground/90 [overflow-wrap:anywhere] @sm:text-sm/6">
        “{example.snippet}”
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <Link
          to={example.href}
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
        >
          {example.studentName}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
        <span className="text-muted-foreground">
          Scored {example.score}/{example.maxScore} on {skill}
        </span>
      </div>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        {prompts.map((prompt) => (
          <li key={prompt}>{prompt}</li>
        ))}
      </ul>
    </div>
  );
}

function FocusRow({ focus }: { focus: ClassModelFocus }) {
  return (
    <li className="flex flex-col gap-2" data-testid="class-models-focus">
      <div>
        <Badge variant="outline" size="sm">
          {focus.label}
        </Badge>
      </div>
      <div className="grid gap-2.5 @xl:grid-cols-2">
        {focus.exemplar ? (
          <ModelCard
            kind="exemplar"
            example={focus.exemplar}
            prompts={focus.exemplarPrompts}
            skill={focus.skill}
          />
        ) : null}
        {focus.instructive ? (
          <ModelCard
            kind="instructive"
            example={focus.instructive}
            prompts={focus.instructivePrompts}
            skill={focus.skill}
          />
        ) : null}
      </div>
    </li>
  );
}

/**
 * Student work the teacher could use on purpose with the whole class: a strong
 * model and an instructive example for the class's weakest rubric categories.
 * Loaded on request — it reads every graded paper — and never stored.
 */
export function ClassModelsSection({
  classAssignmentId,
}: {
  classAssignmentId: string;
}) {
  const fetcher = useFetcher<ModelsData>();
  const isLoading = fetcher.state !== 'idle';
  const data = fetcher.data;

  const load = () => {
    const params = new URLSearchParams({ classAssignmentId });
    fetcher.load(`/api/domain/assignment-insights/models?${params.toString()}`);
  };

  return (
    <section data-testid="class-models-section">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Models to teach from
      </h4>
      <p className="mb-2.5 text-xs text-muted-foreground">
        A strong example to hold up and a near miss the class can learn from,
        drawn from this assignment’s graded work. Decide how — and whether — to
        share each before class.
      </p>

      {!data && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={load}
          disabled={isLoading}
          isLoading={isLoading}
        >
          <BookOpen className="mr-1.5 h-4 w-4" aria-hidden />
          Find models to teach from
        </Button>
      )}

      {data && data.message && !data.models && (
        <p className="text-sm text-muted-foreground" role="alert">
          {data.message}
        </p>
      )}

      {data && !data.message && !data.models && (
        <p className="text-sm text-muted-foreground">
          Not enough contrast in the graded work yet. Grade a few more
          submissions, then check again.
        </p>
      )}

      {data?.models && (
        <ul className="flex flex-col gap-4">
          {data.models.focuses.map((focus) => (
            <FocusRow key={focus.category} focus={focus} />
          ))}
        </ul>
      )}
    </section>
  );
}
