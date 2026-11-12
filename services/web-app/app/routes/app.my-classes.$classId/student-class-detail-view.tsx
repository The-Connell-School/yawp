import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Form, Link, useSearchParams } from 'react-router';
import { CaretLeftIcon } from '~/components/icons';
import { ClassArt } from '~/components/class-art';
import { NoDataPlaceholder } from '~/components/no-data-placeholder';
import { Input } from '~/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { getClassCardHeading } from '~/utils/class-display';
import {
  resolveDocumentLinkTarget,
  type DocumentLinkSubmission,
} from '~/utils/document-link-target';
import {
  getStudentDocumentStatus,
  STUDENT_DOCUMENT_STATUS_LABELS,
  type StudentDocumentStatus,
} from '~/utils/student-document-status';
import { cn } from '~/utils/misc';
import type { StudentClassDetail } from './student-class-detail.server';

const tabTriggerClassName =
  'relative mr-6 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2.5 text-sm font-normal text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none';

type AssignmentTypeRow = StudentClassDetail['assignmentTypes'][number];
type ClassAssignmentRow = StudentClassDetail['assignments'][number];
type DocumentRow = StudentClassDetail['documents'][number];

function AssignmentTypeHeroImage({
  assignmentType,
}: {
  assignmentType: AssignmentTypeRow;
}) {
  if (assignmentType.image?.id) {
    return (
      <img
        src={`/api/image/course/${assignmentType.image.id}`}
        alt=""
        className="size-[72px] shrink-0 rounded-[10px] object-cover ring-1 ring-border"
      />
    );
  }

  return (
    <div
      className="flex size-[72px] shrink-0 items-center justify-center rounded-[10px] bg-muted ring-1 ring-border"
      aria-hidden
    />
  );
}

function groupAssignmentsByType(
  assignments: ClassAssignmentRow[],
  assignmentTypes: AssignmentTypeRow[]
) {
  const byTypeId = new Map<string, ClassAssignmentRow[]>();

  for (const classAssignment of assignments) {
    const typeId = classAssignment.assignment.assignmentType.id;
    const bucket = byTypeId.get(typeId) ?? [];
    bucket.push(classAssignment);
    byTypeId.set(typeId, bucket);
  }

  const sections: Array<{
    assignmentType: AssignmentTypeRow;
    assignments: ClassAssignmentRow[];
  }> = [];

  const seen = new Set<string>();

  for (const assignmentType of assignmentTypes) {
    const bucket = byTypeId.get(assignmentType.id);
    if (!bucket?.length) continue;
    seen.add(assignmentType.id);
    sections.push({ assignmentType, assignments: bucket });
  }

  for (const [typeId, bucket] of byTypeId) {
    if (seen.has(typeId) || bucket.length === 0) continue;
    const fallbackType = bucket[0].assignment.assignmentType;
    sections.push({
      assignmentType: {
        id: fallbackType.id,
        title: fallbackType.title,
        image: null,
      },
      assignments: bucket,
    });
  }

  return sections;
}

function NewAssignmentIndicator() {
  return (
    <span
      aria-label="New assignment"
      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary"
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-primary"
      />
      New
    </span>
  );
}

function StudentAssignmentStartRow({
  classAssignment,
  isNew,
}: {
  classAssignment: ClassAssignmentRow;
  isNew: boolean;
}) {
  const title =
    classAssignment.assignment.title?.trim() || 'Untitled Assignment';
  const promptPreview = classAssignment.assignment.prompt?.trim() ?? '';

  return (
    <tr className="border-t border-border first:border-t-0">
      <td className="w-[34%] px-3.5 py-3">
        <Form
          method="post"
          action={`/app/class-assignments/${classAssignment.id}/start`}
          className="min-w-0"
        >
          <span className="flex min-w-0 items-center gap-2">
            <button
              type="submit"
              className="min-w-0 truncate text-left text-sm font-semibold text-foreground hover:text-primary"
            >
              {title}
            </button>
            {isNew ? <NewAssignmentIndicator /> : null}
          </span>
        </Form>
      </td>
      <td className="max-w-0 px-3.5 py-3">
        <span className="block truncate text-[13px] text-muted-foreground">
          {promptPreview}
        </span>
      </td>
    </tr>
  );
}

function documentAssignmentTypeTitle(doc: DocumentRow): string | null {
  return (
    doc.classAssignment?.assignment.assignmentType.title ??
    doc.assignment?.assignmentType.title ??
    null
  );
}

function formatDocumentLastEdited(
  updatedAt: Date | string,
  status: StudentDocumentStatus
) {
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(updatedAt));

  return status === 'in-progress' ? `Edited ${label}` : label;
}

const STUDENT_DOCUMENT_STATUS_PILL_CLASSES: Record<
  StudentDocumentStatus,
  string
> = {
  'in-progress':
    'bg-[hsl(45_24.2424%_87.0588%)] text-foreground',
  submitted: 'bg-[hsl(210_60%_94%)] text-[hsl(210_50%_32%)]',
  graded: 'bg-[hsl(150_40%_92%)] text-[hsl(150_40%_25%)]',
};

function StudentDocumentStatusPill({ status }: { status: StudentDocumentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
        STUDENT_DOCUMENT_STATUS_PILL_CLASSES[status]
      )}
    >
      {STUDENT_DOCUMENT_STATUS_LABELS[status]}
    </span>
  );
}

function StudentClassDocumentsTable({
  documents,
  classId,
}: {
  documents: DocumentRow[];
  classId: string;
}) {
  const [query, setQuery] = useState('');
  const exitTo = `/app/my-classes/${classId}`;

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;

    return documents.filter((doc) => {
      const title =
        doc.title?.trim() ||
        doc.assignment?.title?.trim() ||
        'Untitled document';
      const typeTitle = documentAssignmentTypeTitle(doc) ?? '';
      return (
        title.toLowerCase().includes(normalized) ||
        typeTitle.toLowerCase().includes(normalized)
      );
    });
  }, [documents, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents"
          aria-label="Search documents"
          className="h-9 border-0 bg-[hsl(45_24.2424%_90%)] pl-9 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]"
        />
      </div>

      {filteredDocuments.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-background">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Document', 'Assignment type', 'Status', 'Last edited'].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3.5 py-2.5 text-left text-xs font-medium text-muted-foreground"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => {
                const submissions = (doc.submissions ??
                  []) as DocumentLinkSubmission[];
                const status = getStudentDocumentStatus(submissions);
                const title =
                  doc.title?.trim() ||
                  doc.assignment?.title?.trim() ||
                  'Untitled document';
                const targetPath = doc.group
                  ? `/app/collab-documents/${doc.id}?exitTo=${encodeURIComponent(exitTo)}`
                  : resolveDocumentLinkTarget({
                      documentId: doc.id,
                      exitTo,
                      isStudentView: true,
                      submissions,
                    });

                return (
                  <tr key={doc.id} className="border-t border-border">
                    <td className="px-3.5 py-3">
                      <Link
                        to={targetPath}
                        className="text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {title}
                      </Link>
                    </td>
                    <td className="px-3.5 py-3 text-[13px] text-muted-foreground">
                      {documentAssignmentTypeTitle(doc) ?? '—'}
                    </td>
                    <td className="px-3.5 py-3">
                      <StudentDocumentStatusPill status={status} />
                    </td>
                    <td className="px-3.5 py-3 text-[13px] text-muted-foreground">
                      {formatDocumentLastEdited(doc.updatedAt, status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : documents.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents match your search.
        </p>
      ) : (
        <NoDataPlaceholder
          title="No documents"
          subtitle="Start an assignment from the Assignments tab."
        />
      )}
    </div>
  );
}

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
  const { klass, assignments, assignmentTypes, documents } = data;
  const { title, subtitle } = getClassCardHeading(klass);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab =
    requestedTab === 'documents' ? 'documents' : 'assignments';

  const startedClassAssignmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const doc of documents) {
      if (doc.classAssignmentId) ids.add(doc.classAssignmentId);
    }
    return ids;
  }, [documents]);

  const assignmentSections = useMemo(
    () => groupAssignmentsByType(assignments, assignmentTypes),
    [assignments, assignmentTypes]
  );

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

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-5 px-3 py-5 pb-24 sm:px-5">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const next = new URLSearchParams(searchParams);
            next.set('tab', value);
            setSearchParams(next, { replace: true });
          }}
          className="flex flex-col gap-6"
        >
          <TabsList
            aria-label="Class"
            className="inline-flex h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0"
          >
            <TabsTrigger value="assignments" className={tabTriggerClassName}>
              Assignments
            </TabsTrigger>
            <TabsTrigger value="documents" className={tabTriggerClassName}>
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="mt-0 flex flex-col gap-6">
            {assignmentSections.length > 0 ? (
              assignmentSections.map(({ assignmentType, assignments: rows }) => {
                const newCount = rows.filter(
                  (row) => !startedClassAssignmentIds.has(row.id)
                ).length;

                return (
                  <section
                    key={assignmentType.id}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3.5">
                      <AssignmentTypeHeroImage assignmentType={assignmentType} />
                      <div className="min-w-0">
                        <h3 className="text-[17px] font-semibold text-foreground">
                          {assignmentType.title}
                        </h3>
                        <p className="text-[13px] text-muted-foreground">
                          {rows.length}{' '}
                          {rows.length === 1 ? 'assignment' : 'assignments'}
                          {newCount > 0
                            ? ` · ${newCount} new`
                            : null}
                        </p>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border bg-background">
                      <table className="w-full table-fixed border-collapse">
                        <tbody>
                          {rows.map((classAssignment) => (
                            <StudentAssignmentStartRow
                              key={classAssignment.id}
                              classAssignment={classAssignment}
                              isNew={
                                !startedClassAssignmentIds.has(classAssignment.id)
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })
            ) : (
              <NoDataPlaceholder
                title="No assignments"
                subtitle="When your teacher posts assignments for this class, they will appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <StudentClassDocumentsTable
              documents={documents}
              classId={klass.id}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
