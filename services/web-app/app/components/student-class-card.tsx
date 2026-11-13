import { Link } from 'react-router';
import { ClassArt } from '~/components/class-art';
import { getClassCardHeading } from '~/utils/class-display';
import { buildMyClassTabHref } from '~/utils/class-page-tab-href';
import type { StudentEnrolledClass } from '~/utils/student-classes.server';

export { formatClassCardTitle as formatStudentClassLabel } from '~/utils/class-display';

function StudentClassCardTabLink({
  to,
  label,
  testId,
}: {
  to: ReturnType<typeof buildMyClassTabHref>;
  label: string;
  testId: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      onClick={(event) => event.stopPropagation()}
      className="relative z-[1] flex flex-1 items-center justify-center px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {label}
    </Link>
  );
}

export function StudentClassCard({ klass }: { klass: StudentEnrolledClass }) {
  const { title, subtitle } = getClassCardHeading(klass);
  const classPath = `/app/my-classes/${klass.id}`;

  return (
    <div className="flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <Link to={classPath} data-testid="student-class-card-main-link" className="block shrink-0">
        <div className="h-28 w-full border-b border-black/5">
          <ClassArt
            seed={klass.id}
            classArtKey={klass.classArtKey}
            legacyClassArtIndex={klass.legacyClassArtIndex}
          />
        </div>
        <div className="flex flex-col gap-1 p-4">
          {klass.school?.name ? (
            <p className="font-mono text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
              {klass.school.name}
            </p>
          ) : null}
          <h4 className="text-balance text-base font-semibold tracking-tight text-foreground">
            {title}
          </h4>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          {klass.teacherNames.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {klass.teacherNames.join(', ')}
            </p>
          ) : null}
        </div>
      </Link>
      <div className="relative z-[1] mt-auto grid grid-cols-2 divide-x divide-black/5 border-t border-black/5">
        <StudentClassCardTabLink
          to={buildMyClassTabHref(klass.id, 'assignments')}
          label="Assignments"
          testId="student-class-card-tab-assignments"
        />
        <StudentClassCardTabLink
          to={buildMyClassTabHref(klass.id, 'documents')}
          label="Documents"
          testId="student-class-card-tab-documents"
        />
      </div>
    </div>
  );
}
