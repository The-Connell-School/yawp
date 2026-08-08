import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useLoaderData } from 'react-router';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  groupStudentDocumentsByClass,
  type StudentDocumentGroupingRow,
} from '~/utils/student-document-grouping';
import {
  orderAssignmentModuleSessionsForCurrentStep,
  type AssignmentModuleSessionResumeCandidate,
} from '~/utils/assignment-module-session-resume';

export const handle = { breadcrumb: 'My Documents' };

function orderDocumentTileModuleSessions<
  T extends { assignmentModuleSessions: AssignmentModuleSessionResumeCandidate[] },
>(documents: T[]) {
  return documents.map((document) => ({
    ...document,
    assignmentModuleSessions: orderAssignmentModuleSessionsForCurrentStep(
      document.assignmentModuleSessions
    ),
  }));
}

const documentInclude = {
  classAssignment: {
    select: {
      class: {
        select: { id: true, grade: true, period: true, title: true },
      },
    },
  },
  assignmentModuleSessions: {
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
    },
  },
} as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'STUDENT') {
    throw redirect('/app/documents');
  }

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    where: { membershipId: profile.id, deletedAt: null, archivedAt: null },
    include: documentInclude,
  });

  const groups = groupStudentDocumentsByClass(
    orderDocumentTileModuleSessions(
      documents
    ) as unknown as StudentDocumentGroupingRow[]
  );

  return dataResponse({ groups, documentCount: documents.length });
}

export default function MyDocumentsRoute() {
  const { groups, documentCount } = useLoaderData<typeof loader>();

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
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <div key={group.classId ?? 'unassigned'}>
                <p className="my-2 text-foreground/60">{group.label}</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {group.documents.map((doc: any) => (
                    <DocumentLink
                      key={doc.id}
                      doc={doc}
                      exitTo="/app/my-documents"
                      isStudentView
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
