import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import {
  Link,
  useLoaderData,
  useSearchParams,
  useNavigate,
} from 'react-router';
import { useState, useCallback, useMemo } from 'react';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
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
import { getClassCardHeading } from '~/utils/class-display';
import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import { Loader2 } from 'lucide-react';
import { postFormWithFallbackRetry } from '~/utils/llm-retry-ui';
import {
  ClassInsightsPanel,
  type ClassInsight,
  type ClassInsightSummary,
} from './class-insights-panel';

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
  if (!classId || !assignmentId)
    throw new Response('Not Found', { status: 404 });

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    throw new Response('Not Found', { status: 404 });
  }

  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { id: profile.id } },
    },
    select: {
      id: true,
      grade: true,
      period: true,
      school: { select: { id: true, name: true, organizationId: true } },
    },
  });
  if (!klass) throw new Response('Not Found', { status: 404 });

  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      assignmentId,
      classId,
      class: { teachers: { some: { id: profile.id } } },
    },
    select: {
      id: true,
      assignment: {
        select: {
          id: true,
          title: true,
          submitForGrade: true,
          pointValue: true,
          assignmentType: { select: { title: true } },
        },
      },
    },
  });
  if (!classAssignment) throw new Response('Not Found', { status: 404 });
  const assignment = classAssignment.assignment;

  const classInsightsEnabled = profile.organization.classInsightsEnabled;
  const insightRow = classInsightsEnabled
    ? await prisma.classAssignmentInsight.findUnique({
        where: { classAssignmentId: classAssignment.id },
        select: {
          status: true,
          submissionCount: true,
          generatedAt: true,
          summaryJson: true,
        },
      })
    : null;
  const insight: ClassInsight | null =
    insightRow && insightRow.status === 'ready' && insightRow.summaryJson
      ? {
          status: 'ready',
          submissionCount: insightRow.submissionCount,
          generatedAt: insightRow.generatedAt
            ? insightRow.generatedAt.toISOString()
            : null,
          summary: insightRow.summaryJson as unknown as ClassInsightSummary,
        }
      : null;

  const gradedCount = await prisma.submission.count({
    where: {
      gradedAt: { not: null },
      document: {
        classAssignmentId: classAssignment.id,
        deletedAt: null,
      },
    },
  });

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status');
  const status: StatusFilter = isValidStatus(rawStatus)
    ? rawStatus
    : 'submitted';

  const isDocumentSubmissionEnabled = true;

  const submissions =
    status !== 'in-progress'
      ? await prisma.submission.findMany({
          where: {
            document: {
              classAssignmentId: classAssignment.id,
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
                membership: {
                  select: {
                    id: true,
                    user: { select: { name: true, email: true } },
                  },
                },
                group: { select: { id: true, label: true } },
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
        })
      : [];

  const inProgressDocuments =
    status === 'in-progress'
      ? await prisma.document.findMany({
          where: {
            classAssignmentId: classAssignment.id,
            deletedAt: null,
            archivedAt: null,
            submissions: { none: {} },
          },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            membership: {
              select: {
                id: true,
                user: { select: { name: true, email: true } },
              },
            },
            group: { select: { id: true, label: true } },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];

  return dataResponse({
    klass,
    assignment,
    classAssignmentId: classAssignment.id,
    insight,
    classInsightsEnabled,
    gradedCount,
    status,
    isDocumentSubmissionEnabled,
    submissions,
    inProgressDocuments,
  });
}

type GradingState = 'grading' | 'retrying' | 'done' | 'error';

export default function AssignmentSubmissionsRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    klass,
    assignment,
    classAssignmentId,
    insight,
    classInsightsEnabled,
    gradedCount,
    status,
    isDocumentSubmissionEnabled,
    submissions,
    inProgressDocuments,
  } = data;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gradingProgress, setGradingProgress] = useState<
    Record<string, GradingState>
  >({});
  const [isGrading, setIsGrading] = useState(false);
  const [gradingNotice, setGradingNotice] = useState<string | null>(null);
  const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set());
  const [isReleasing, setIsReleasing] = useState(false);
  const hasRetryingSubmission = Object.values(gradingProgress).some(
    (state) => state === 'retrying'
  );

  const backUrl = `/app/my-classes/${klass.id}?tab=assignments`;
  const artifactLabel = (document: {
    membership: {
      user: { name: string | null; email: string | null; username?: string | null };
    } | null;
    group: { label: string } | null;
  }) =>
    document.group?.label ??
    document.membership?.user.name ??
    document.membership?.user.email ??
    'Student';

  // Submissions that haven't finished grading yet (filter out 'done' ones)
  const visibleSubmissions = useMemo(
    () => submissions.filter((s) => gradingProgress[s.id] !== 'done'),
    [submissions, gradingProgress]
  );

  // Graded submissions not yet released in this session
  const visibleGraded = useMemo(
    () => submissions.filter((s) => !releasedIds.has(s.id)),
    [submissions, releasedIds]
  );

  const activeList =
    status === 'submitted' ? visibleSubmissions : visibleGraded;

  const allSelected =
    activeList.length > 0 && activeList.every((s) => selected.has(s.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeList.map((s) => s.id)));
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
    setGradingNotice(null);
    // The server paces AI grading per teacher. A short wait (per-minute window)
    // is absorbed here so a normal class batch just takes a little longer; a long
    // wait (hour/day ceiling) stops the batch with an explicit message instead of
    // marking every remaining essay as failed.
    const MAX_AUTO_WAIT_SECONDS = 90;
    const MAX_PACING_ATTEMPTS = 6;
    let stoppedMessage: string | null = null;
    for (let index = 0; index < ids.length; index += 1) {
      const submissionId = ids[index]!;
      setGradingProgress((prev) => ({ ...prev, [submissionId]: 'grading' }));
      try {
        let attempt = 0;
        let outcome: Response | null = null;
        for (;;) {
          const form = new FormData();
          form.append('submissionId', submissionId);
          const { response } = await postFormWithFallbackRetry({
            action: '/api/domain/grade-essay-ai',
            formData: form,
            onRetry: () =>
              setGradingProgress((prev) => ({
                ...prev,
                [submissionId]: 'retrying',
              })),
          });
          if (response.status !== 429) {
            outcome = response;
            break;
          }
          const retryAfter = Number(response.headers.get('Retry-After')) || 10;
          attempt += 1;
          if (retryAfter > MAX_AUTO_WAIT_SECONDS || attempt >= MAX_PACING_ATTEMPTS) {
            const minutes = Math.ceil(retryAfter / 60);
            const remaining = ids.length - index;
            stoppedMessage = `AI grading is paused by the usage limit. ${remaining} essay${remaining === 1 ? ' was' : 's were'} not graded and still selected. Try again in about ${
              retryAfter > 90 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${retryAfter} seconds`
            }.`;
            break;
          }
          setGradingNotice(
            `Pacing AI grading to stay within the usage limit. Resuming in ${retryAfter} seconds…`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, (retryAfter + 1) * 1000)
          );
          setGradingNotice(null);
        }
        if (stoppedMessage) {
          // Leave this and every later essay untouched and selected.
          setGradingProgress((prev) => {
            const next = { ...prev };
            delete next[submissionId];
            return next;
          });
          break;
        }
        if (outcome?.ok) {
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
    setGradingNotice(stoppedMessage);
    setIsGrading(false);
  }, [selected]);

  const releaseGrades = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;

    setIsReleasing(true);
    try {
      const form = new FormData();
      ids.forEach((id) => form.append('submissionIds', id));
      const response = await fetch('/api/domain/release-grades', {
        method: 'POST',
        body: form,
      });
      if (response.ok) {
        setReleasedIds((prev) => new Set([...prev, ...ids]));
        setSelected(new Set());
      }
    } catch {
      // stay in current state, teacher can retry
    }
    setIsReleasing(false);
  }, [selected]);

  const handleStatusChange = (newStatus: StatusFilter) => {
    setSelected(new Set());
    navigate(`?status=${newStatus}`);
  };

  // 'submitted' stays as the URL param for old links; the teacher-facing
  // lifecycle calls this state Needs Grading.
  const statusLabel: Record<StatusFilter, string> = {
    'in-progress': 'In Progress',
    submitted: 'Needs Grading',
    graded: 'Graded',
    released: 'Released',
  };
  const { title, subtitle } = getClassCardHeading(klass);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      {/* Header */}
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-muted-foreground">{subtitle}</p>
            ) : null}
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
            <span>{assignment.assignmentType.title}</span>
          </div>
        </div>

        {/* Class-wide, assignment-level feedback for the teacher */}
        <div className="mb-6">
          {classInsightsEnabled ? (
            <ClassInsightsPanel
              classAssignmentId={classAssignmentId}
              initialInsight={insight}
              gradedCount={gradedCount}
            />
          ) : null}
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
              disabled={
                !isDocumentSubmissionEnabled || selected.size === 0 || isGrading
              }
              onClick={gradeWithAI}
            >
              {isGrading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {hasRetryingSubmission ? 'Retrying...' : 'Grading…'}
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
            {gradingNotice ? (
              <span role="status" className="text-sm text-amber-700">
                {gradingNotice}
              </span>
            ) : null}
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
                      <TableCell>{artifactLabel(doc)}</TableCell>
                      <TableCell>
                        <Link
                          to={
                            doc.group
                              ? `/app/group-drafts/${doc.id}`
                              : `/app/documents/${doc.id}?left=tutor`
                          }
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
            {visibleSubmissions.length === 0 &&
            Object.values(gradingProgress).some((v) => v === 'done') ? (
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
                    <TableHead>Submitted at</TableHead>
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
                            disabled={
                              !isDocumentSubmissionEnabled ||
                              state === 'grading' ||
                              state === 'retrying'
                            }
                            aria-label="Select submission"
                          />
                        </TableCell>
                        <TableCell>{artifactLabel(sub.document)}</TableCell>
                        <TableCell>
                          <Link
                            to={`/app/submissions/${sub.id}?${
                              isDocumentSubmissionEnabled ? 'edit=1&' : ''
                            }exitTo=${encodeURIComponent(backUrl)}`}
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
                          ) : state === 'retrying' ? (
                            <span className="flex items-center gap-1 text-sm text-blue-600">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Retrying...
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

        {/* Graded table — with batch release */}
        {status === 'graded' && (
          <>
            {/* Release toolbar */}
            <div className="mb-3 flex items-center gap-3">
              <Button
                size="sm"
                disabled={
                  !isDocumentSubmissionEnabled ||
                  selected.size === 0 ||
                  isReleasing
                }
                onClick={releaseGrades}
              >
                {isReleasing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Releasing…
                  </>
                ) : (
                  `Release Grades${selected.size > 0 ? ` (${selected.size})` : ''}`
                )}
              </Button>
              {selected.size > 0 && !isReleasing && (
                <span className="text-sm text-muted-foreground">
                  {selected.size} selected
                </span>
              )}
            </div>

            {visibleGraded.length === 0 && releasedIds.size > 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                All grades released. Switch to{' '}
                <button
                  className="text-primary hover:underline"
                  onClick={() => handleStatusChange('released')}
                >
                  Released
                </button>{' '}
                to confirm.
              </p>
            ) : visibleGraded.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No graded submissions waiting to be released.
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
                    <TableHead>Grade</TableHead>
                    <TableHead>Graded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleGraded.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(sub.id)}
                          onCheckedChange={() => toggleSelect(sub.id)}
                          disabled={isReleasing}
                          aria-label="Select submission"
                        />
                      </TableCell>
                      <TableCell>{artifactLabel(sub.document)}</TableCell>
                      <TableCell>
                        <Link
                          to={`/app/submissions/${sub.id}?${
                            isDocumentSubmissionEnabled ? 'edit=1&' : ''
                          }exitTo=${encodeURIComponent(backUrl)}`}
                          className="text-primary hover:underline"
                        >
                          {sub.document.title || sub.title || 'Untitled'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {formatAssignmentGrade({
                          submitForGrade: assignment.submitForGrade,
                          numericPercentage: sub.numericPercentage ?? null,
                          letterGrade: sub.letterGrade ?? null,
                          pointValue: assignment.pointValue,
                          score: sub.score,
                        }) ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {sub.gradedAt ? timeAgo(sub.gradedAt) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}

        {/* Released table — read-only */}
        {status === 'released' && (
          <>
            {submissions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No released submissions for this assignment.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Released</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>{artifactLabel(sub.document)}</TableCell>
                      <TableCell>
                        <Link
                          to={`/app/submissions/${sub.id}?${
                            isDocumentSubmissionEnabled ? 'edit=1&' : ''
                          }exitTo=${encodeURIComponent(backUrl)}`}
                          className="text-primary hover:underline"
                        >
                          {sub.document.title || sub.title || 'Untitled'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {formatAssignmentGrade({
                          submitForGrade: assignment.submitForGrade,
                          numericPercentage: sub.numericPercentage ?? null,
                          letterGrade: sub.letterGrade ?? null,
                          pointValue: assignment.pointValue,
                          score: sub.score,
                        }) ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {sub.releasedAt ? timeAgo(sub.releasedAt) : '—'}
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
