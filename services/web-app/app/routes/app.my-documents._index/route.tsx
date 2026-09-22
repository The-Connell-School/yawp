import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useMemo } from 'react';
import { useLoaderData, useSearchParams } from 'react-router';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { StudentDocumentFiltersBar } from '~/components/student-document-filters';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { resolveStudentSchoolYearScope } from '~/utils/school-year-scope.server';
import { ALL_SCHOOL_YEARS } from '~/utils/school-year';
import {
  groupStudentDocumentsByClass,
  type StudentDocumentGroupingRow,
} from '~/utils/student-document-grouping';
import {
  buildStudentAssignmentFilterOptions,
  buildStudentClassFilterOptions,
  filterStudentDocuments,
  hasActiveStudentDocumentFilters,
  parseStudentDocumentFilters,
  serializeStudentDocumentFilters,
  type StudentDocumentFilters,
} from '~/utils/student-document-filters';
import { countStudentDocumentStatuses } from '~/utils/student-document-status';
import {
  orderAssignmentModuleSessionsForCurrentStep,
  type AssignmentModuleSessionResumeCandidate,
} from '~/utils/assignment-module-session-resume';

export const handle = { breadcrumb: 'My Documents' };

function orderDocumentTileModuleSessions<
  T extends {
    assignmentModuleSessions: AssignmentModuleSessionResumeCandidate[];
  },
>(documents: T[]) {
  return documents.map((document) => ({
    ...document,
    assignmentModuleSessions: orderAssignmentModuleSessionsForCurrentStep(
      document.assignmentModuleSessions
    ),
  }));
}

const documentInclude = (membershipId: string) => ({
  assignment: { select: { id: true, title: true } },
  group: {
    select: {
      id: true,
      label: true,
      members: {
        where: { removedAt: null },
        select: { membershipId: true },
      },
    },
  },
  classAssignment: {
    select: {
      class: {
        select: { id: true, grade: true, period: true, title: true },
      },
    },
  },
  assignmentModuleSessions: {
    where: {
      OR: [{ membershipId: null }, { membershipId }],
    },
    include: {
      assignmentModule: {
        include: { instructions: { select: { id: true } } },
      },
    },
    orderBy: { assignmentModule: { position: 'desc' as const } },
  },
  submissions: {
    where: { archivedAt: null },
    orderBy: { submittedAt: 'desc' as const },
    select: {
      id: true,
      title: true,
      releasedAt: true,
      submittedAt: true,
      // Read by both the status filter and DocumentLink's badge, which both
      // treat archived and teacher-unsubmitted submissions as invisible.
      archivedAt: true,
      unsubmittedAt: true,
    },
  },
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'STUDENT') {
    throw redirect('/app/documents');
  }

  // The same school year that scopes the student's classes scopes their work,
  // so this page and My Classes cannot disagree about what year it is.
  //
  // Class work is scoped by the class it belongs to. A document attached to no
  // class — a free write the student started themselves — has no year to be
  // outside of, so it stays on the list whichever year is selected. Hiding it
  // would lose the student's own writing rather than tidy their view.
  const schoolYearScope = await resolveStudentSchoolYearScope(
    request,
    profile.id
  );

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    where: {
      deletedAt: null,
      archivedAt: null,
      AND: [
        {
          OR: [
            { membershipId: profile.id },
            {
              AND: [
                {
                  group: {
                    is: {
                      members: {
                        some: { membershipId: profile.id, removedAt: null },
                      },
                    },
                  },
                },
                {
                  classAssignment: {
                    is: {
                      OR: [{ postAt: null }, { postAt: { lte: new Date() } }],
                      class: { students: { some: { id: profile.id } } },
                    },
                  },
                },
              ],
            },
          ],
        },
        ...(schoolYearScope === ALL_SCHOOL_YEARS
          ? []
          : [
              {
                OR: [
                  {
                    classAssignment: { class: { schoolYear: schoolYearScope } },
                  },
                  { classAssignment: { is: null } },
                ],
              },
            ]),
      ],
    },
    include: documentInclude(profile.id),
  });

  const ordered = orderDocumentTileModuleSessions(documents);
  const url = new URL(request.url);

  return dataResponse({
    documents: ordered,
    documentCount: documents.length,
    classes: buildStudentClassFilterOptions(ordered),
    assignments: buildStudentAssignmentFilterOptions(ordered),
    filters: parseStudentDocumentFilters(url.searchParams),
  });
}

export default function MyDocumentsRoute() {
  const { documents, documentCount, classes, assignments, filters } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const filteredDocuments = useMemo(
    () => filterStudentDocuments(documents, filters),
    [documents, filters]
  );

  const groups = useMemo(
    () =>
      groupStudentDocumentsByClass(
        filteredDocuments as unknown as StudentDocumentGroupingRow[]
      ),
    [filteredDocuments]
  );

  // Counts on the status pills reflect the class/assignment narrowing already
  // applied, the same way the teacher pills do.
  const statusCounts = useMemo(
    () =>
      countStudentDocumentStatuses(
        filterStudentDocuments(documents, {
          ...filters,
          status: 'all',
        })
      ),
    [documents, filters]
  );

  const totalCount = useMemo(
    () =>
      Object.values(statusCounts).reduce((total, count) => total + count, 0),
    [statusCounts]
  );

  const hasActiveFilters = hasActiveStudentDocumentFilters(filters);

  const updateFilters = (updates: Partial<StudentDocumentFilters>) => {
    setSearchParams(
      serializeStudentDocumentFilters({ ...filters, ...updates }, searchParams),
      { replace: true }
    );
  };

  const clearFilters = () => {
    setSearchParams(
      serializeStudentDocumentFilters(
        { classIds: [], assignmentIds: [], status: 'all' },
        searchParams
      ),
      { replace: true }
    );
  };

  const exitTo = `/app/my-documents${
    searchParams.toString() ? `?${searchParams.toString()}` : ''
  }`;

  return (
    <section
      data-testid="app.my-documents._index"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>My Documents</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[460px]">
              Everything you have written, organized by class.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-6 pb-24 sm:px-5">
        {documentCount === 0 ? (
          <NoDataPlaceholder
            title="No documents"
            subtitle="Documents you write will show up here, organized by class."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <StudentDocumentFiltersBar
              filters={filters}
              statusCounts={statusCounts}
              totalCount={totalCount}
              classes={classes}
              assignments={assignments}
              hasActiveFilters={hasActiveFilters}
              onFiltersChange={updateFilters}
              onClearFilters={clearFilters}
            />

            {filteredDocuments.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12"
                data-testid="my-documents-empty"
              >
                <span className="text-lg font-bold">No documents found</span>
                <span className="text-sm text-muted-foreground">
                  Try adjusting your filters
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {groups.map((group) => (
                  <div key={group.classId ?? 'unassigned'}>
                    <p className="my-2 text-foreground/60">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {group.documents.map((doc: any) => (
                        <DocumentLink
                          key={doc.id}
                          doc={doc}
                          exitTo={exitTo}
                          isStudentView
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
