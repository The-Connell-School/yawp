import { Link } from 'react-router';
import { ClassArt } from '~/components/class-art';
import {
  getClassCardHeading,
} from '~/utils/class-display';
import type { StudentEnrolledClass } from '~/utils/student-classes.server';

export { formatClassCardTitle as formatStudentClassLabel } from '~/utils/class-display';

export function StudentClassCard({ klass }: { klass: StudentEnrolledClass }) {
  const { title, subtitle } = getClassCardHeading(klass);

  return (
    <Link
      to="/app/my-documents"
      className="flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
    >
      <div className="h-28 w-full border-b border-black/5">
        <ClassArt
          seed={klass.id}
          classArtKey={klass.classArtKey}
          legacyClassArtIndex={klass.legacyClassArtIndex}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
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
  );
}
