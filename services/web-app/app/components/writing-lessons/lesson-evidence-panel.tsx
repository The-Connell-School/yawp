import { ChevronRight, LineChart, Target } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { splitAroundUnderline } from '~/utils/writing-lessons/act-practice.shared';
import type {
  LessonEvidence,
  LessonEvidenceMiss,
} from '~/utils/writing-lessons/lesson-evidence';

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/**
 * The teacher's half of a lesson page: not the lesson (they can read that
 * alongside their students) but what a student can never see — how this skill
 * has actually landed in their classes, and the questions their students keep
 * getting wrong.
 */
export function LessonEvidencePanel({
  evidence,
  isComposition,
}: {
  evidence: LessonEvidence;
  isComposition: boolean;
}) {
  const hasClasses = evidence.classes.length > 0;
  const accuracy =
    evidence.answeredCount > 0
      ? Math.round((evidence.correctCount / evidence.answeredCount) * 100)
      : null;

  return (
    <Card className="shadow-none" data-testid="lesson-evidence">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">How this has landed</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasClasses ? (
          <p
            data-testid="lesson-evidence-empty"
            className="text-base text-muted-foreground sm:text-sm"
          >
            No class of yours has worked this skill yet. Assign it below and
            what your students do with it shows up here.
          </p>
        ) : (
          <>
            <p className="text-base text-muted-foreground sm:text-sm">
              {evidence.studentsPracticed === 0
                ? `Assigned to ${evidence.classes.length === 1 ? 'one class' : `${evidence.classes.length} classes`} — nobody has started yet.`
                : isComposition
                  ? `${evidence.studentsPracticed} ${evidence.studentsPracticed === 1 ? 'student has' : 'students have'} written on this skill: ${evidence.masteredCount} mastered, ${evidence.revisingCount} still revising.`
                  : `${evidence.studentsPracticed} ${evidence.studentsPracticed === 1 ? 'student has' : 'students have'} practiced this skill — ${evidence.correctCount} of ${evidence.answeredCount} answers correct${accuracy === null ? '' : ` (${accuracy}%)`}.`}
            </p>

            <ul className="space-y-2" data-testid="lesson-evidence-classes">
              {evidence.classes.map((klass) => (
                <li
                  key={klass.classAssignmentId}
                  className="rounded-xl border border-border/70 p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-medium text-foreground sm:text-sm">
                      {klass.classLabel}
                    </p>
                    {klass.dueAt ? (
                      <span className="text-xs text-muted-foreground">
                        Due {formatDueDate(klass.dueAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {klass.assignmentTitle}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" size="sm">
                      {klass.practicedCount} of {klass.studentCount} practiced
                    </Badge>
                    {klass.answeredCount > 0 ? (
                      <Badge variant="outline" size="sm">
                        {klass.correctCount}/{klass.answeredCount} correct
                      </Badge>
                    ) : null}
                    {klass.masteredCount + klass.revisingCount > 0 ? (
                      <Badge variant="outline" size="sm">
                        {klass.masteredCount} mastered
                        {klass.revisingCount > 0
                          ? ` · ${klass.revisingCount} revising`
                          : ''}
                      </Badge>
                    ) : null}
                  </div>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 -ml-2 h-7 px-2 text-xs"
                  >
                    <Link
                      to={`/app/writing-lessons/results/${klass.classAssignmentId}`}
                    >
                      View results
                      <ChevronRight className="ml-1 size-3.5 shrink-0" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>

            {evidence.misses.length > 0 ? (
              <div className="space-y-2" data-testid="lesson-evidence-misses">
                <div className="flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Where they go wrong
                  </p>
                </div>
                {evidence.misses.map((miss) => (
                  <MissCard key={miss.sentence} miss={miss} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MissCard({ miss }: { miss: LessonEvidenceMiss }) {
  const parts = splitAroundUnderline(miss.sentence, miss.underline);

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="text-base leading-relaxed text-foreground sm:text-sm">
        {parts.before}
        {parts.underlined ? (
          <span className="font-semibold underline decoration-primary decoration-2 underline-offset-4">
            {parts.underlined}
          </span>
        ) : null}
        {parts.after}
      </p>
      <p className="text-xs font-medium text-muted-foreground">
        {miss.wrongCount} of {miss.answeredCount} missed this
      </p>
      <div className="space-y-1 text-xs">
        {miss.topWrongChoice ? (
          <p className="text-rose-800">
            <span className="font-semibold">They chose:</span>{' '}
            {miss.topWrongChoice}
          </p>
        ) : null}
        <p className="text-emerald-800">
          <span className="font-semibold">Correct:</span> {miss.correctChoice}
        </p>
      </div>
      {miss.explanation ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {miss.explanation}
        </p>
      ) : null}
    </div>
  );
}
