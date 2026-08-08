import { Link } from 'react-router';
import { ClassArt } from '~/components/class-art';

export type TeacherClassCardData = {
  id: string;
  grade: string;
  period: string | null;
  title: string | null;
  classArtKey: string | null;
  legacyClassArtIndex?: number | null;
  school: { id: string; name: string } | null;
  _count: { students: number; assignments: number };
  stats?: {
    ungradedCount: number;
    gradedUnreleasedCount: number;
  };
};

export function formatTeacherClassLabel(klass: {
  grade: string;
  period: string | null;
  title?: string | null;
}) {
  const base = klass.period
    ? `Grade ${klass.grade} • Period ${klass.period}`
    : `Grade ${klass.grade}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

export function TeacherClassCard({
  klass,
}: {
  klass: TeacherClassCardData;
}) {
  return (
    <div className="flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <Link
        to={`/app/my-classes/${klass.id}`}
        className="flex min-h-full flex-1 flex-col"
      >
        <div className="h-32 w-full border-b border-black/5">
          <ClassArt
            seed={klass.id}
            classArtKey={klass.classArtKey}
            legacyClassArtIndex={klass.legacyClassArtIndex ?? null}
          />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            {klass.school?.name ? (
              <p className="font-mono text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
                {klass.school.name}
              </p>
            ) : null}
            <h4 className="mt-1 text-balance text-base font-semibold tracking-tight text-foreground">
              {formatTeacherClassLabel(klass)}
            </h4>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 divide-x divide-black/5 border-t border-black/5">
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {klass._count.students}
            </p>
            <p className="text-xs text-muted-foreground">
              {klass._count.students === 1 ? 'Student' : 'Students'}
            </p>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {klass._count.assignments}
            </p>
            <p className="text-xs text-muted-foreground">
              {klass._count.assignments === 1 ? 'Assignment' : 'Assignments'}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
