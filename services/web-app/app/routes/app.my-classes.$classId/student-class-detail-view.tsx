import { Link } from 'react-router';
import { CaretLeftIcon } from '~/components/icons';
import { ClassArt } from '~/components/class-art';
import { DocumentLink } from '~/components/document-link';
import { NoDataPlaceholder } from '~/components/no-data-placeholder';
import { StudentAssignmentCard } from '~/components/student-assignment-card';
import { getClassCardHeading } from '~/utils/class-display';
import type { StudentClassDetail } from './student-class-detail.server';

/**
 * The student's view of one class: its assignments, a way to start something
 * new, and the student's own documents for the class.
 *
 * Deliberately not the teacher's `ClassDetailHeader` / `ClassAssignmentsTab`:
 * those carry the roster, the class code, Edit Class, per-assignment graded
 * counts and other students' document pills. This page shows only what the
 * student is allowed to see, and reuses the pieces that are shared — the class
 * art, the heading formatter, and the student assignment/document cards.
 */
export function StudentClassDetailView({
  data,
}: {
  data: StudentClassDetail & { role: 'STUDENT' };
}) {
  const { klass, assignments, documents } = data;
  const { title, subtitle } = getClassCardHeading(klass);

  return (
    <section
      data-testid="student-class-detail"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Link
            to="/app/my-classes"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <CaretLeftIcon className="size-4" />
            My Classes
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
                <ClassArt
                  seed={klass.id}
                  classArtKey={klass.classArtKey}
                  legacyClassArtIndex={klass.legacyClassArtIndex}
                />
              </div>
              <div className="min-w-0">
                {klass.school?.name ? (
                  <p className="font-mono text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
                    {klass.school.name}
                  </p>
                ) : null}
                <h2 className="text-balance">{title}</h2>
                {subtitle ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {subtitle}
                  </p>
                ) : null}
                {klass.teacherNames.length > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {klass.teacherNames.join(', ')}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex flex-col">
          <p className="my-2 text-foreground/60">Assignments</p>
          {assignments.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {assignments.map((classAssignment) => (
                <StudentAssignmentCard
                  key={classAssignment.id}
                  classAssignment={classAssignment}
                />
              ))}
            </div>
          ) : (
            <NoDataPlaceholder
              title="No assignments"
              subtitle="When your teacher posts assignments for this class, they will appear here."
            />
          )}
        </div>

        <div className="mt-8 flex flex-col">
          <p className="my-2 text-foreground/60">Documents</p>
          {documents.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {documents.map((doc) => (
                <DocumentLink
                  key={doc.id}
                  doc={doc}
                  exitTo={`/app/my-classes/${klass.id}`}
                  isStudentView
                />
              ))}
            </div>
          ) : (
            <NoDataPlaceholder
              title="No documents"
              subtitle="Start an assignment from the Assignments section above."
            />
          )}
        </div>
      </div>
    </section>
  );
}
