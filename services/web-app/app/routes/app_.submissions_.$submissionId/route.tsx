import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import {
  useLoaderData,
  Link,
  useSearchParams,
  useNavigate,
  useFetcher,
  useLocation,
  useRevalidator,
  redirect,
} from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { requireUserId, requireMembership } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import { type RubricDisplayConfig } from '~/domain/grading/rubric-display';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { findExcerptRange } from '~/utils/excerpt-position';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { EssayPanel } from './essay-panel';
import { GradingCommentsSidebar } from './teacher-grading/grading-comments-sidebar';
import { SelectionToolbar } from './teacher-grading/selection-toolbar';
import { GradeHighlightsOverlay } from './teacher-grading/grade-highlights-overlay';
import { SubmissionLifecyclePanel } from './teacher-grading/submission-lifecycle-panel';
import { ViewPanel } from './teacher-grading/view-panel';
import { resolveSubmissionGradeMode } from './submission-grade-mode';
import { resolveSubmissionLifecycleState } from './submission-lifecycle-state';
import { resolveRubricConfigForSubmission } from './submission-rubric-config.server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// ── Revalidation ─────────────────────────────────────────────────────

export function shouldRevalidate() {
  return false;
}

// ── Loader ───────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const url = new URL(request.url);
  const editParam = url.searchParams.get('edit') === '1';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        is: {
          OR: [
            { membershipId: profile.id },
            {
              membership: {
                classesAsStudent: {
                  some: {
                    teachers: {
                      some: { id: profile.id },
                    },
                  },
                },
              },
            },
            ...(user?.isAdmin ? [{}] : []),
          ],
        },
      },
    },
    select: {
      id: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      score: true,
      feedback: true,
      rubricScores: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      grammarIssues: true,
      promptConfig: true,
      aiMeta: true,
      releasedAt: true,
      gradedAt: true,
      gradedByMembershipId: true,
      archivedAt: true,
      documentId: true,
      document: {
        select: {
          id: true,
          title: true,
          assignmentTypeId: true,
          assignment: {
            select: {
              submitForGrade: true,
              pointValue: true,
              gradingAssistantStrictnessLevel: true,
            },
          },
          classAssignment: {
            select: {
              class: {
                select: {
                  id: true,
                  schoolId: true,
                  school: { select: { organizationId: true } },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
          membership: {
            select: {
              id: true,
              userId: true,
              user: { select: { name: true } },
              classesAsStudent: {
                select: {
                  id: true,
                  schoolId: true,
                  school: { select: { organizationId: true } },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
        },
      },
      comments: {
        include: {
          membership: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      gradingAssistantRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          assignmentTypeRubricSnapshot: true,
        },
      },
    },
  });

  if (!submission) {
    return redirectWithToast('/app', {
      description: 'Submission not found.',
      type: 'error',
    });
  }

  // Determine if viewer is the owner (student) or a teacher
  const isOwner = submission.document.membership.id === profile.id;

  const isTeacher =
    !isOwner &&
    profile.role === 'TEACHER' &&
    (submission.document.classAssignment?.class?.teachers.some(
      (teacher) => teacher.id === profile.id
    ) ||
      submission.document.membership.classesAsStudent.some((klass) =>
        klass.teachers.some((teacher) => teacher.id === profile.id)
      ));

  const isAdmin = user?.isAdmin ?? false;

  if (isOwner && editParam) {
    const next = new URL(request.url);
    next.searchParams.delete('edit');
    throw redirect(`${next.pathname}${next.search}${next.hash}`);
  }

  const rubricConfig = await resolveRubricConfigForSubmission({
    assignmentTypeId: submission.document.assignmentTypeId,
    latestGradingRun: submission.gradingAssistantRuns[0] ?? null,
    rubricScores: submission.rubricScores,
  });

  // Sort comments by document location
  const sortedComments = [...submission.comments].sort((a, b) => {
    const aRange = findExcerptRange(
      submission.text,
      a.excerpt,
      a.occurrence ?? 1
    );
    const bRange = findExcerptRange(
      submission.text,
      b.excerpt,
      b.occurrence ?? 1
    );
    if (aRange && bRange) {
      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      return aRange.end - bRange.end;
    }
    if (aRange) return -1;
    if (bRange) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    submission: {
      ...submission,
      comments: sortedComments,
      rubricConfig,
    },
    isOwner,
    isTeacher: isTeacher || isAdmin,
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function SubmissionRoute() {
  const {
    submission,
    isOwner,
    isTeacher,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const revalidator = useRevalidator();
  const titleFetcher = useFetcher();
  // Edit mode is driven by ?edit=1 so refreshes keep the same tab.
  // URL param is the explicit override: ?edit=1 → grade, ?edit=0 → view.
  const editParam = searchParams.get('edit');
  const isGradingOther = isTeacher && !isOwner;
  const setEditParam = useCallback(
    (value: '0' | '1') => {
      const params = new URLSearchParams(searchParams);
      params.set('edit', value);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const handleEdit = useCallback(() => setEditParam('1'), [setEditParam]);
  const handleDoneEditing = useCallback(
    () => setEditParam('0'),
    [setEditParam]
  );

  const [localGradedAt, setLocalGradedAt] = useState<string | null>(null);
  const [localReleasedAt, setLocalReleasedAt] = useState<string | null>(null);
  const [teacherGradeUi, setTeacherGradeUi] = useState<{
    numericPercentage: number | null;
    letterGrade: string | null;
    score: string | null;
    overallComment: string | null;
    rubricScores: unknown;
    rubricConfig?: RubricDisplayConfig | null;
  } | null>(null);

  useEffect(() => {
    setTeacherGradeUi(null);
  }, [submission.id]);

  useEffect(() => {
    if (titleFetcher.state !== 'idle') return;
    const body = titleFetcher.data as { success?: boolean } | undefined;
    if (body?.success) revalidator.revalidate();
  }, [titleFetcher.state, titleFetcher.data, revalidator]);

  const effectiveGradedAt = localGradedAt ?? submission.gradedAt;
  const effectiveReleasedAt = localReleasedAt ?? submission.releasedAt;
  const isGraded = !!effectiveGradedAt;
  const isReleased = !!effectiveReleasedAt;
  const lifecycleState = resolveSubmissionLifecycleState({
    isGraded,
    isReleased,
  });
  const isGradeMode = resolveSubmissionGradeMode({
    isGradingOther,
    editParam,
    lifecycleState,
  });
  // Students viewing a submission whose grade hasn't been released yet
  const isPending = isOwner && !effectiveReleasedAt;

  const canEditTitle = isOwner || isTeacher;
  const submissionTitleDisplay =
    submission.title.trim() || submission.document.title || '';

  // Exit target — same pattern as documents route
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );
  const essayRef = useRef<HTMLDivElement>(null);
  const [essayElement, setEssayElement] = useState<HTMLDivElement | null>(null);
  const setEssayRef = useCallback((el: HTMLDivElement | null) => {
    (essayRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setEssayElement(el);
  }, []);

  // ── Grade display ──────────────────────────────────────────────────
  const effectiveNumericPct =
    teacherGradeUi?.numericPercentage ?? submission.numericPercentage ?? null;
  const effectiveLetterGrade =
    teacherGradeUi?.letterGrade ?? submission.letterGrade ?? null;
  const assignmentIsSubmittedForGrade =
    submission.document.assignment?.submitForGrade !== false;
  const gradeDisplay =
    formatAssignmentGrade({
      submitForGrade: submission.document.assignment?.submitForGrade,
      numericPercentage: effectiveNumericPct,
      letterGrade: effectiveLetterGrade,
      pointValue: submission.document.assignment?.pointValue ?? null,
      score: teacherGradeUi?.score ?? submission.score,
    }) ||
    (assignmentIsSubmittedForGrade && submission.overallScore
      ? `${submission.overallScore}/5`
      : null);

  // ── Status badge (reflects optimistic save / release) ─────────────
  const statusLabel = isOwner
    ? effectiveReleasedAt
      ? 'Graded'
      : submission.submittedAt
        ? 'Submitted'
        : 'Draft'
    : effectiveGradedAt
      ? 'Graded'
      : submission.submittedAt
        ? 'Submitted'
        : 'Draft';
  const statusVariant = isOwner
    ? effectiveReleasedAt
      ? ('success' as const)
      : submission.submittedAt
        ? ('info-outlined' as const)
        : ('secondary' as const)
    : effectiveGradedAt
      ? ('success' as const)
      : submission.submittedAt
        ? ('info-outlined' as const)
        : ('secondary' as const);

  // ── Local comments state (optimistic, no revalidation) ─────────────
  const [comments, setComments] = useState(submission.comments);
  const handleCommentCreated = useCallback((comment: any) => {
    setComments((prev) => [...prev, comment]);
  }, []);
  const handleCommentDeleted = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);
  const handleCommentUpdated = useCallback(
    (commentId: string, content: string) => {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, content } : c))
      );
    },
    []
  );

  // ── Grade mode state ───────────────────────────────────────────────
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<
    string | null
  >(null);

  // Clear active comment when clicking outside a highlight or comment card
  useEffect(() => {
    if (!activeGradeCommentId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-grade-comment-id]')) return;
      if (target.closest('[data-grade-comment-card]')) return;
      setActiveGradeCommentId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeGradeCommentId]);
  const [draftHighlight, setDraftHighlight] = useState<{
    excerpt: string;
    occurrence: number;
  } | null>(null);
  const [tooltipIssueIds, setTooltipIssueIds] = useState<string[]>([]);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [tooltipPage, setTooltipPage] = useState(0);
  const tooltipHoveredRef = useRef(false);
  const tooltipClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const persistedGrammarIssues = useMemo(
    () =>
      parseGrammarIssuesPayload(submission.grammarIssues, {
        sourceText: submission.text ?? '',
      }),
    [submission.text, submission.id, submission.grammarIssues]
  );
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>(
    persistedGrammarIssues
  );
  const grammarIssuesRef = useRef(grammarIssues);
  grammarIssuesRef.current = grammarIssues;
  const grammarIssueSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const grammarIssueSaveVersionRef = useRef(0);
  const [hiddenGrammarIssueIds, setHiddenGrammarIssueIds] = useState<string[]>(
    []
  );
  /** Student-only: hide purple AI grammar marks in the essay (teacher feedback marks stay). */
  const [studentGrammarHighlightsVisible, setStudentGrammarHighlightsVisible] =
    useState(true);

  // Resync grammar issues when persisted value changes
  const lastPersistedRef = useRef(persistedGrammarIssues);
  if (lastPersistedRef.current !== persistedGrammarIssues) {
    lastPersistedRef.current = persistedGrammarIssues;
    grammarIssuesRef.current = persistedGrammarIssues;
    setGrammarIssues(persistedGrammarIssues);
    setHiddenGrammarIssueIds([]);
  }

  const visibleGrammarIssues = useMemo(
    () =>
      grammarIssues.filter(
        (issue) => !hiddenGrammarIssueIds.includes(issue.id)
      ),
    [grammarIssues, hiddenGrammarIssueIds]
  );

  const tooltipPos = useMemo(() => {
    if (!tooltipRect) return null;
    return {
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    };
  }, [tooltipRect]);

  const activeGrammarIssues = useMemo(() => {
    if (tooltipIssueIds.length === 0) return [];
    return tooltipIssueIds
      .map((id) => grammarIssues.find((issue) => issue.id === id))
      .filter((issue): issue is GrammarIssue => issue != null);
  }, [grammarIssues, tooltipIssueIds]);

  const showGrammarMarksInEssay =
    isPending || isGradingOther || (isOwner && studentGrammarHighlightsVisible);

  const essayHighlights = useMemo(
    () => [
      ...(isPending
        ? []
        : comments.map((c) => ({
            id: c.id,
            excerpt: c.excerpt,
            occurrence: c.occurrence,
            dataAttr: 'data-grade-comment-id' as const,
            className: 'grade-comment-mark',
          }))),
      ...(isPending || !showGrammarMarksInEssay
        ? []
        : visibleGrammarIssues.map((g) => ({
            id: g.id,
            excerpt: g.excerpt,
            occurrence: g.occurrence,
            dataAttr: 'data-grammar-issue-id' as const,
            className: 'grammar-issue-mark',
          }))),
      ...(draftHighlight
        ? [
            {
              id: 'draft',
              excerpt: draftHighlight.excerpt,
              occurrence: draftHighlight.occurrence,
              dataAttr: 'data-grade-comment-id' as const,
              className: 'grade-comment-mark draft',
            },
          ]
        : []),
    ],
    [
      comments,
      visibleGrammarIssues,
      draftHighlight,
      isPending,
      showGrammarMarksInEssay,
    ]
  );

  useEffect(() => {
    if (studentGrammarHighlightsVisible || !isOwner) return;
    setTooltipIssueIds([]);
    setTooltipRect(null);
  }, [studentGrammarHighlightsVisible, isOwner]);

  const handleGrammarIssueHover = useCallback(
    (ids: string[], rect: DOMRect | null) => {
      if (tooltipClearTimerRef.current) {
        clearTimeout(tooltipClearTimerRef.current);
        tooltipClearTimerRef.current = null;
      }
      if (ids.length > 0) {
        setTooltipIssueIds(ids);
        setTooltipPage(0);
        setTooltipRect(rect);
      } else {
        // Delay clear so cursor can move from mark to tooltip
        tooltipClearTimerRef.current = setTimeout(() => {
          if (!tooltipHoveredRef.current) {
            setTooltipIssueIds([]);
            setTooltipRect(null);
          }
          tooltipClearTimerRef.current = null;
        }, 100);
      }
    },
    []
  );

  const toggleGrammarIssueVisibility = useCallback((id: string) => {
    setHiddenGrammarIssueIds((prev) =>
      prev.includes(id)
        ? prev.filter((currentId) => currentId !== id)
        : [...prev, id]
    );
  }, []);

  const handleGrammarIssuesChange = useCallback((issues: GrammarIssue[]) => {
    setGrammarIssues(issues);
    setHiddenGrammarIssueIds([]);
  }, []);

  const handleAiGradingComplete = useCallback(
    (payload: {
      numericPercentage: number | null;
      letterGrade: string | null;
      score: string | null;
      overallComment: string | null;
      rubricScores: unknown;
      rubricConfig?: RubricDisplayConfig | null;
    }) => {
      setTeacherGradeUi(payload);
      if (!submission.gradedAt) {
        setLocalGradedAt(new Date().toISOString());
        // Generating suggestions marks it graded server-side too, but the
        // teacher is mid-review — keep the editable form open rather than
        // snapping to the Graded state's default read-only summary.
        setEditParam('1');
      }
    },
    [submission.gradedAt, setEditParam]
  );

  const teacherExistingGrade = useMemo(
    () => ({
      id: submission.id,
      score: teacherGradeUi?.score ?? submission.score,
      feedback: submission.feedback,
      rubricScores: teacherGradeUi?.rubricScores ?? submission.rubricScores,
      overallComment:
        teacherGradeUi?.overallComment ?? submission.overallComment,
      numericPercentage:
        teacherGradeUi?.numericPercentage ?? submission.numericPercentage,
      letterGrade: teacherGradeUi?.letterGrade ?? submission.letterGrade,
      releasedAt: submission.releasedAt,
    }),
    [
      submission.id,
      submission.feedback,
      submission.releasedAt,
      submission.score,
      submission.rubricScores,
      submission.overallComment,
      submission.numericPercentage,
      submission.letterGrade,
      teacherGradeUi,
    ]
  );

  const submissionForView = useMemo(
    () => ({
      ...submission,
      numericPercentage:
        teacherGradeUi?.numericPercentage ?? submission.numericPercentage,
      letterGrade: teacherGradeUi?.letterGrade ?? submission.letterGrade,
      score: teacherGradeUi?.score ?? submission.score,
      overallComment:
        teacherGradeUi?.overallComment ?? submission.overallComment,
      rubricScores: teacherGradeUi?.rubricScores ?? submission.rubricScores,
    }),
    [submission, teacherGradeUi]
  );

  const persistGrammarIssues = useCallback(
    async (issues: GrammarIssue[]) => {
      if (!isGradingOther || !isGradeMode) return;
      const res = await fetch('/api/domain/update-submission', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          grammarIssues: issues,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to save grammar issue removal.');
      }
    },
    [isGradeMode, isGradingOther, submission.id]
  );

  const handleRemoveGrammarIssue = useCallback(
    async (id: string) => {
      const nextIssues = grammarIssuesRef.current.filter(
        (issue) => issue.id !== id
      );
      if (nextIssues.length === grammarIssuesRef.current.length) return;

      grammarIssuesRef.current = nextIssues;
      setGrammarIssues(nextIssues);
      setHiddenGrammarIssueIds((prev) =>
        prev.filter((currentId) => currentId !== id)
      );

      const saveVersion = ++grammarIssueSaveVersionRef.current;
      const saveRequest = grammarIssueSaveQueueRef.current
        .catch(() => undefined)
        .then(() => persistGrammarIssues(nextIssues));
      grammarIssueSaveQueueRef.current = saveRequest;

      try {
        await saveRequest;
      } catch {
        if (saveVersion === grammarIssueSaveVersionRef.current) {
          revalidator.revalidate();
        }
      }
    },
    [persistGrammarIssues, revalidator]
  );

  // ── Lifecycle panel: edit mode, Save, Release ───────────────────────
  const releaseFetcher = useFetcher<{ success?: boolean }>();
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const isReleasing = releaseFetcher.state !== 'idle';

  const lastHandledReleaseRef = useRef<unknown>(null);
  useEffect(() => {
    if (
      releaseFetcher.data?.success &&
      releaseFetcher.state === 'idle' &&
      releaseFetcher.data !== lastHandledReleaseRef.current
    ) {
      lastHandledReleaseRef.current = releaseFetcher.data;
      setLocalReleasedAt(new Date().toISOString());
    }
  }, [releaseFetcher.data, releaseFetcher.state]);

  const handleMarkGraded = useCallback(async () => {
    setIsSavingGrade(true);
    try {
      const res = await fetch('/api/domain/update-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          markAsGraded: true,
        }),
      });
      if (res.ok) {
        setLocalGradedAt(new Date().toISOString());
        // Move to the Graded state's default read-only view.
        setEditParam('0');
      }
    } finally {
      setIsSavingGrade(false);
    }
  }, [submission.id, setEditParam]);

  const handleReleaseGrade = useCallback(() => {
    const formData = new FormData();
    formData.append('submissionIds', submission.id);
    releaseFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/release-grades',
    });
  }, [submission.id, releaseFetcher]);

  // ── Paths ──────────────────────────────────────────────────────────
  const revisePath = `/app/documents/${submission.documentId}?revise=1`;
  const viewDocumentHref = useMemo(() => {
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    return `/app/documents/${submission.documentId}?exitTo=${encodeURIComponent(returnUrl)}`;
  }, [
    location.pathname,
    location.search,
    location.hash,
    submission.documentId,
  ]);

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="flex w-full items-center gap-3 border-b bg-white px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(exitTarget)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        <div className="flex min-w-0 items-center gap-2">
          {isGradingOther && submission.document.membership.user.name ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {submission.document.membership.user.name}
            </span>
          ) : null}
          {isGradingOther && submission.document.membership.user.name ? (
            <span className="text-muted-foreground/40 shrink-0">·</span>
          ) : null}
          {canEditTitle ? (
            <Input
              key={`${submission.id}-${submission.title}`}
              data-testid="submission-title-input"
              size="sm"
              className="min-w-0 max-w-md truncate rounded-lg border border-transparent text-sm font-semibold transition hover:border-border"
              defaultValue={submissionTitleDisplay}
              placeholder="Untitled"
              disabled={titleFetcher.state !== 'idle'}
              onBlur={(e) => {
                const next = e.target.value.trim();
                const prev =
                  submission.title.trim() || submission.document.title || '';
                if (next === prev) return;
                titleFetcher.submit(
                  { intent: 'updateTitle', title: e.target.value },
                  {
                    method: 'POST',
                    action: `/api/model/submission/${submission.id}`,
                  }
                );
              }}
            />
          ) : (
            <p className="truncate text-sm font-semibold">
              {submission.title || submission.document.title || 'Untitled'}
            </p>
          )}
        </div>

        <Badge variant={statusVariant} className="shrink-0">
          {statusLabel}
        </Badge>

        {gradeDisplay && !isPending ? (
          <Badge
            variant="secondary"
            className="shrink-0 border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
          >
            {gradeDisplay}
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {isGradingOther ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                to={viewDocumentHref}
                data-testid="submission-view-document"
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View document
              </Link>
            </Button>
          ) : null}
          {isOwner && !isPending && persistedGrammarIssues.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={studentGrammarHighlightsVisible}
              data-testid="toggle-grammar-highlights"
              onClick={() => setStudentGrammarHighlightsVisible((v) => !v)}
            >
              {studentGrammarHighlightsVisible
                ? 'Hide grammar highlights'
                : 'Show grammar highlights'}
            </Button>
          ) : null}
          {/* Student: Revise Essay link */}
          {isOwner ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={revisePath}>Revise Essay</Link>
            </Button>
          ) : null}
        </div>
      </nav>

      {isGradingOther && submission.archivedAt ? (
        <div
          className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          data-testid="teacher-submission-archived-banner"
          role="status"
        >
          <span className="font-medium">Archived by student.</span> They hid
          this version from their own list. You can still grade it—make sure
          this is the submission you intend to score.
        </div>
      ) : null}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex grow overflow-hidden">
        {/* Left panel: grading (edit/view toggle for teachers) or view-only summary */}
        <div
          className="no-scrollbar flex shrink-0 flex-col overflow-hidden border-r bg-white"
          style={{ width: 380 }}
        >
          {isGradingOther ? (
            <SubmissionLifecyclePanel
              lifecycleState={lifecycleState}
              isEditing={isGradeMode}
              onEdit={handleEdit}
              onDoneEditing={handleDoneEditing}
              onMarkGraded={handleMarkGraded}
              isSavingGrade={isSavingGrade}
              onRelease={handleReleaseGrade}
              isReleasing={isReleasing}
              submissionForView={submissionForView}
              documentId={submission.documentId}
              submissionId={submission.id}
              existingGrade={teacherExistingGrade}
              grammarIssues={grammarIssues}
              hiddenGrammarIssueIds={hiddenGrammarIssueIds}
              onToggleGrammarIssue={toggleGrammarIssueVisibility}
              onRemoveGrammarIssue={handleRemoveGrammarIssue}
              onGrammarIssuesChange={handleGrammarIssuesChange}
              onAiGradingComplete={handleAiGradingComplete}
              rubricConfig={
                teacherGradeUi?.rubricConfig ?? submission.rubricConfig
              }
              initialGradingAssistantStrictnessLevel={
                submission.document.assignment
                  ?.gradingAssistantStrictnessLevel
              }
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center border-b px-4 py-2.5">
                <span className="text-sm font-semibold">Grade Summary</span>
              </div>
              <div className="no-scrollbar grow overflow-y-auto">
                {isPending ? (
                  <PendingViewPanel />
                ) : (
                  <ViewPanel submission={submissionForView} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Center: Essay */}
        <div className="flex min-w-0 grow flex-col overflow-hidden bg-white md:h-full">
          <EssayPanel ref={setEssayRef} html={submission.html ?? ''} />
          {isGradingOther && essayElement ? (
            <SelectionToolbar contentRoot={essayElement} />
          ) : null}
          {essayElement ? (
            <GradeHighlightsOverlay
              contentRoot={essayElement}
              highlights={essayHighlights}
              activeGradeCommentId={activeGradeCommentId}
              onGradeCommentSelect={setActiveGradeCommentId}
              onGrammarIssueHover={handleGrammarIssueHover}
            />
          ) : null}
        </div>

        {/* Right: Feedback comments */}
        <div
          className="no-scrollbar shrink-0 overflow-y-auto border-l bg-white"
          style={{ width: 320 }}
        >
          <GradingCommentsSidebar
            submissionComments={isPending ? [] : (comments as any)}
            submissionId={submission.id}
            sourceText={submission.text ?? ''}
            readOnly={!isGradingOther}
            activeGradeCommentId={activeGradeCommentId}
            onSelectGradeComment={setActiveGradeCommentId}
            onDraftHighlightChange={setDraftHighlight}
            onCommentCreated={handleCommentCreated}
            onCommentDeleted={handleCommentDeleted}
            onCommentUpdated={handleCommentUpdated}
          />
        </div>
      </div>

      {/* Grammar issue tooltip — shown on hover over purple-highlighted text */}
      {!isPending && activeGrammarIssues.length > 0 && tooltipPos
        ? (() => {
            const currentIssue =
              activeGrammarIssues[tooltipPage] ?? activeGrammarIssues[0];
            const hasMultiple = activeGrammarIssues.length > 1;
            return (
              <div
                className="fixed z-50 max-w-xs rounded-lg border border-purple-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
                style={{ top: tooltipPos.top, left: tooltipPos.left }}
                onMouseEnter={() => {
                  tooltipHoveredRef.current = true;
                  if (tooltipClearTimerRef.current) {
                    clearTimeout(tooltipClearTimerRef.current);
                    tooltipClearTimerRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  tooltipHoveredRef.current = false;
                  setTooltipIssueIds([]);
                  setTooltipRect(null);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-purple-500" />
                    <p className="text-xs font-semibold text-purple-700">
                      {currentIssue.kind === 'error'
                        ? 'Grammar Error'
                        : 'Style Suggestion'}
                    </p>
                  </div>
                  {hasMultiple ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-purple-500 hover:bg-purple-100"
                        onClick={() =>
                          setTooltipPage(
                            (p) =>
                              (p - 1 + activeGrammarIssues.length) %
                              activeGrammarIssues.length
                          )
                        }
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs text-purple-500">
                        {tooltipPage + 1}/{activeGrammarIssues.length}
                      </span>
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-purple-500 hover:bg-purple-100"
                        onClick={() =>
                          setTooltipPage(
                            (p) => (p + 1) % activeGrammarIssues.length
                          )
                        }
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm leading-snug select-text">
                  {currentIssue.message}
                </p>
                {currentIssue.rule ? (
                  <p className="mt-1.5 text-xs text-muted-foreground select-text border-t pt-1.5">
                    Rule: {currentIssue.rule}
                  </p>
                ) : null}
                {isGradeMode ? (
                  <div className="mt-2 border-t pt-2">
                    <button
                      type="button"
                      className="w-full rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100"
                      onClick={() => {
                        handleRemoveGrammarIssue(currentIssue.id);
                        setTooltipIssueIds([]);
                        setTooltipRect(null);
                      }}
                    >
                      Remove comment
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })()
        : null}
    </main>
  );
}

// ── Pending View Panel (student, grade not yet released) ─────────────

function PendingViewPanel() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
        <p className="text-sm font-semibold mt-0.5">Submitted</p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Grade</h3>
        <p className="mt-0.5 text-sm italic text-muted-foreground">
          Pending grade
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Feedback</h3>
        <p className="mt-0.5 text-sm italic text-muted-foreground">
          Pending feedback
        </p>
      </div>
    </div>
  );
}

