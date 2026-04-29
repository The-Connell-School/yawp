import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { Link, useLoaderData, useSearchParams, useNavigate } from 'react-router';
import { useState, useCallback, useMemo } from 'react';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { CaretLeftIcon } from '~/components/icons';
import { timeAgo } from '~/utils/timeAgo';
import { formatDateOnly } from '~/utils/date-only';
import { Loader2 } from 'lucide-react';

type StatusFilter = 'submitted' | 'graded' | 'released' | 'in-progress';

const VALID_STATUSES: StatusFilter[] = [
  'submitted',
  'graded',
  'released',
  'in-progress',
];

function isValidStatus(s: string | null): s is StatusFilter {
  return VALID_STATUSES.includes(s as StatusFilter);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { classId, assignmentId } = params;
  if (!classId || !assignmentId) throw new Response('Not Found', { status: 404 });

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { profileId: profile.id } },
    },
    select: {
      id: true,
      grade: true,
      period: true,
      school: { select: { id: true, name: true } },
    },
  });
  if (!klass) throw new Response('Not Found', { status: 404 });

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, classId },
    select: {
      id: true,
      title: true,
      dueDate: true,
      studentCourse: { select: { title: true } },
    },
  });
  if (!assignment) throw new Response('Not Found', { status: 404 });

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status');
  const status: StatusFilter = isValidStatus(rawStatus) ? rawStatus : 'submitted';

  const isDocumentSubmissionEnabled = await isDocumentSubmissionEnabledForSchool(
    klass.school?.id
  );

  const submissions =
    isDocumentSubmissionEnabled && status !== 'in-progress'
      ? await prisma.submission.findMany({
          where: {
            document: {
              assignmentId,
              classId,
              deletedAt: null,
            },
            ...(status === 'submitted'
              ? { gradedAt: null, releasedAt: null }
              : status === 'graded'
                ? { gradedAt: { not: null }, releasedAt: null }
                : { releasedAt: { not: null } }),
          },
          select: {
            id: true,
            title: true,
            submittedAt: true,
            score: true,
            letterGrade: true,
            numericPercentage: true,
            gradedAt: true,
            releasedAt: true,
            document: {
              select: {
                id: true,
                title: true,
                profile: {
                  select: {
                    id: true,
                    user: { select: { name: true, email: true } },
                  },
                },
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
        })
      : [];

  const inProgressDocuments =
    isDocumentSubmissionEnabled && status === 'in-progress'
      ? await prisma.document.findMany({
          where: {
            assignmentId,
            classId,
            deletedAt: null,
            archivedAt: null,
            submissions: { none: {} },
          },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            profile: {
              select: {
                id: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];

  return dataResponse({
    klass,
    assignment,
    status,
    submissions,
    inProgressDocuments,
  });
}

type GradingState = 'grading' | 'done' | 'error';

export default function AssignmentSubmissionsRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { klass, assignment, status, submissions, inProgressDocuments } = data;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gradingProgress, setGradingProgress] = useState<
    Record<string, GradingState>
  >({});
  const [isGrading, setIsGrading] = useState(false);

  const backUrl = `/app/my-classes/${klass.id}?tab=assignments`;

  // Submissions that haven't finished grading yet (filter out 'done' ones)
  const visibleSubmissions = useMemo(
    () => submissions.filter((s) => gradingProgress[s.id] !== 'done'),
    [submissions, gradingProgress]
  );

  const allSelected =
    visibleSubmissions.length > 0 &&
    visibleSubmissions.every((s) => selected.has(s.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleSubmissions.map((s) => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const gradeWithAI = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;

    setIsGrading(true);
    for (const submissionId of ids) {
      setGradingProgress((prev) => ({ ...prev, [submissionId]: 'grading' }));
      try {
        const form = new FormData();
        form.append('submissionId', submissionId);
        const response = await fetch('/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        });
        if (response.ok) {
          setGradingProgress((prev) => ({ ...prev, [submissionId]: 'done' }));
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(submissionId);
            return next;
          });
        } else {
          setGradingProgress((prev) => ({ ...prev, [submissionId]: 'error' }));
        }
      } catch {
        setGradingProgress((prev) => ({ ...prev, [submissionId]: 'error' }));
      }
    }
    setIsGrading(false);
  }, [selected]);

  const handleStatusChange = (newStatus: StatusFilter) => {
    navigate(`?status=${newStatus}`);
  };

  const statusLabel: Record<StatusFilter, string> = {
    'in-progress': 'In Progress',
    submitted: 'Submitted',
    graded: 'Graded',
    released: 'Released',
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      {/* Header */}
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>
              Grade {klass.grade} • Period {klass.period}
            </h2>
            {klass.school?.name ? (
              <p className="mt-1 text-muted-foreground">{klass.school.name}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        {/* Back link */}
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link to={backUrl}>
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
            </Link>
          </Button>
        </div>

        {/* Assignment info */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold">
            {assignment.title || 'Untitled Assignment'}
          </h3>
          <div className="mt-1 flex gap-4 text-sm text-muted-foreground">
            <span>{assignment.studentCourse.title}</span>
            {assignment.dueDate && (
              <span>Due {formatDateOnly(assignment.dueDate)}</span>
            )}
          </div>
        </div>

        {/* Status tabs */}
        <div className="mb-4 flex gap-1 border-b">
          {VALID_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                status === s
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {statusLabel[s]}
            </button>
          ))}
        </div>

        {/* Grade with AI toolbar — submitted only */}
        {status === 'submitted' && (
          <div className="mb-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={selected.size === 0 || isGrading}
              onClick={gradeWithAI}
            >
              {isGrading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Grading…
                </>
              ) : (
                `Grade with AI${selected.size > 0 ? ` (${selected.size})` : ''}`
              )}
            </Button>
            {selected.size > 0 && !isGrading && (
              <span className="text-sm text-muted-foreground">
                {selected.size} selected
              </span>
            )}
          </div>
        )}

        {/* In-progress documents table */}
        {status === 'in-progress' && (
          <>
            {inProgressDocuments.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No drafts in progress for this assignment.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inProgressDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        {doc.profile.user.name ?? doc.profile.user.email}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/app/documents/${doc.id}?left=tutor`}
                          className="text-primary hover:underline"
                        >
                          {doc.title || 'Untitled'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {timeAgo(doc.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}

        {/* Submitted table with checkboxes */}
        {status === 'submitted' && (
          <>
            {visibleSubmissions.length === 0 && Object.values(gradingProgress).some((v) => v === 'done') ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                All selected essays have been graded. Switch to{' '}
                <button
                  className="text-primary hover:underline"
                  onClick={() => handleStatusChange('graded')}
                >
                  Graded
                </button>{' '}
                to review them.
              </p>
            ) : visibleSubmissions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No ungraded submissions for this assignment.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSubmissions.map((sub) => {
                    const state = gradingProgress[sub.id];
                    return (
                      <TableRow
                        key={sub.id}
                        className={state === 'error' ? 'bg-red-50' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected.has(sub.id)}
                            onCheckedChange={() => toggleSelect(sub.id)}
                            disabled={state === 'grading'}
                            aria-label="Select submission"
                          />
                        </TableCell>
                        <TableCell>
                          {sub.document.profile.user.name ??
                            sub.document.profile.user.email}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/app/submissions/${sub.id}?edit=1&exitTo=${encodeURIComponent(backUrl)}`}
                            className="text-primary hover:underline"
                          >
                            {sub.document.title || sub.title || 'Untitled'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {timeAgo(sub.submittedAt)}
                        </TableCell>
                        <TableCell>
                          {state === 'grading' ? (
                            <span className="flex items-center gap-1 text-sm text-blue-600">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Grading…
                            </span>
                          ) : state === 'error' ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200">
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Ungraded</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}

        {/* Graded / Released tables */}
        {(status === 'graded' || status === 'released') && (
          <>
            {submissions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No{' '}
                {status === 'graded' ? 'graded' : 'released'} submissions for
                this assignment.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>
                      {status === 'graded' ? 'Graded' : 'Released'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        {sub.document.profile.user.name ??
                          sub.document.profile.user.email}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/app/submissions/${sub.id}?edit=1&exitTo=${encodeURIComponent(backUrl)}`}
                          className="text-primary hover:underline"
                        >
                          {sub.document.title || sub.title || 'Untitled'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {sub.score ?? sub.letterGrade ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {status === 'graded'
                          ? sub.gradedAt
                            ? timeAgo(sub.gradedAt)
                            : '—'
                          : sub.releasedAt
                            ? timeAgo(sub.releasedAt)
                            : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
    </section>
  );
}
