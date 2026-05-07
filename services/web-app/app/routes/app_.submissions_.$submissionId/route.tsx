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
} from 'react-router';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { requireUserId, requireProfile } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { findExcerptRange } from '~/utils/excerpt-position';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { isSideBySideRevisionEnabled } from '~/utils/feature-flags.server';
import { EssayPanel } from './essay-panel';
import { TeacherGradingPanel } from './teacher-grading/teacher-grading-panel';
import { GradingCommentsSidebar } from './teacher-grading/grading-comments-sidebar';
import { SelectionToolbar } from './teacher-grading/selection-toolbar';
import { GradeHighlightsOverlay } from './teacher-grading/grade-highlights-overlay';

// ── Revalidation ─────────────────────────────────────────────────────

export function shouldRevalidate() {
  return false;
}

// ── Loader ───────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
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
        OR: [
          // Owner of the document
          { profile: { id: profile.id } },
          // Teacher of the student's class
          {
            profile: {
              studentProfile: {
                classes: {
                  some: {
                    teachers: {
                      some: { profileId: profile.id },
                    },
                  },
                },
              },
            },
          },
          // Admin override
          ...(user?.isAdmin ? [{}] : []),
        ],
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
      gradedById: true,
      archivedAt: true,
      documentId: true,
      document: {
        select: {
          id: true,
          title: true,
          profile: {
            select: {
              id: true,
              userId: true,
              user: { select: { name: true } },
            },
          },
        },
      },
      comments: {
        include: {
          profile: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
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
  const isOwner = submission.document.profile.id === profile.id;

  // Teacher detection: profile has a teacherProfile linked to student's class
  const isTeacher = !isOwner
    ? !!(await prisma.teacherProfile.findFirst({
        where: {
          profileId: profile.id,
          classes: {
            some: {
              students: {
                some: {
                  profileId: submission.document.profile.id,
                },
              },
            },
          },
        },
        select: { id: true },
      }))
    : false;

  const isAdmin = user?.isAdmin ?? false;

  // Grade mode: teacher AND (not yet released OR explicitly editing)
  const isGradeMode =
    (isTeacher || isAdmin) && (!submission.releasedAt || editParam);

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
    return (
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });

  const sideBySideRevisionEnabled = await isSideBySideRevisionEnabled();

  return {
    submission: {
      ...submission,
      comments: sortedComments,
    },
    isOwner,
    isTeacher: isTeacher || isAdmin,
    isGradeMode,
    sideBySideRevisionEnabled,
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function SubmissionRoute() {
  const { submission, isOwner, isTeacher, isGradeMode: loaderGradeMode, sideBySideRevisionEnabled } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const revalidator = useRevalidator();
  const titleFetcher = useFetcher();
  // Grade mode driven by ?edit=1 query param so refreshes keep the same tab
  // URL param is the explicit override: ?edit=1 → grade, ?edit=0 → view.
  // When no param, fall back to loader default (ungraded = grade mode).
  const editParam = searchParams.get('edit');
  const isGradeMode = isTeacher && (editParam !== null ? editParam === '1' : loaderGradeMode);

  const [localGradedAt, setLocalGradedAt] = useState<string | null>(null);
  const [localReleasedAt, setLocalReleasedAt] = useState<string | null>(null);
  const [teacherGradeUi, setTeacherGradeUi] = useState<{
    numericPercentage: number | null;
    letterGrade: string | null;
    score: string | null;
    overallComment: string | null;
    rubricScores: unknown;
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
  // Students viewing a submission whose grade hasn't been released yet
  const isPending = isOwner && !effectiveReleasedAt;

  const canEditTitle = isOwner || isTeacher;
  const submissionTitleDisplay =
    submission.title.trim() ||
    submission.document.title ||
    '';

  // Exit target — same pattern as documents route
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );
  const essayRef = useRef<HTMLDivElement>(null);
  const [essayElement, setEssayElement] = useState<HTMLDivElement | null>(null);
  const setEssayRef = useCallback(
    (el: HTMLDivElement | null) => {
      (essayRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setEssayElement(el);
    },
    []
  );

  // ── Grade display ──────────────────────────────────────────────────
  const effectiveNumericPct =
    teacherGradeUi?.numericPercentage ?? submission.numericPercentage ?? null;
  const effectiveLetterGrade =
    teacherGradeUi?.letterGrade ?? submission.letterGrade ?? null;
  const gradeDisplay =
    formatGrade(effectiveNumericPct, effectiveLetterGrade) ||
    (teacherGradeUi?.score ?? submission.score) ||
    (submission.overallScore ? `${submission.overallScore}/5` : null);

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
  const handleCommentUpdated = useCallback((commentId: string, content: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content } : c))
    );
  }, []);

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
  const tooltipClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistedGrammarIssues = useMemo(
    () =>
      parseGrammarIssuesPayload(submission.grammarIssues, {
        sourceText: submission.text ?? '',
      }),
    [submission.text, submission.id, submission.grammarIssues]
  );
  const [grammarIssues, setGrammarIssues] =
    useState<GrammarIssue[]>(persistedGrammarIssues);
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
    isPending ||
    !isOwner ||
    isTeacher ||
    studentGrammarHighlightsVisible;

  const essayHighlights = useMemo(() => [
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
      ? [{
          id: 'draft',
          excerpt: draftHighlight.excerpt,
          occurrence: draftHighlight.occurrence,
          dataAttr: 'data-grade-comment-id' as const,
          className: 'grade-comment-mark draft',
        }]
      : []),
  ], [
    comments,
    visibleGrammarIssues,
    draftHighlight,
    isPending,
    showGrammarMarksInEssay,
  ]);

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
    }) => {
      setTeacherGradeUi(payload);
      if (!submission.gradedAt) {
        setLocalGradedAt(new Date().toISOString());
      }
    },
    [submission.gradedAt],
  );

  const teacherExistingGrade = useMemo(
    () => ({
      id: submission.id,
      score: teacherGradeUi?.score ?? submission.score,
      feedback: submission.feedback,
      rubricScores: teacherGradeUi?.rubricScores ?? submission.rubricScores,
      overallComment: teacherGradeUi?.overallComment ?? submission.overallComment,
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
    ],
  );

  const submissionForView = useMemo(
    () => ({
      ...submission,
      numericPercentage:
        teacherGradeUi?.numericPercentage ?? submission.numericPercentage,
      letterGrade: teacherGradeUi?.letterGrade ?? submission.letterGrade,
      score: teacherGradeUi?.score ?? submission.score,
      overallComment: teacherGradeUi?.overallComment ?? submission.overallComment,
      rubricScores: teacherGradeUi?.rubricScores ?? submission.rubricScores,
    }),
    [submission, teacherGradeUi],
  );

  const handleRemoveGrammarIssue = useCallback((id: string) => {
    setGrammarIssues((prev) => prev.filter((issue) => issue.id !== id));
    setHiddenGrammarIssueIds((prev) =>
      prev.filter((currentId) => currentId !== id)
    );
  }, []);

  // ── Save / Release grade ────────────────────────────────────────────
  const releaseFetcher = useFetcher<{ success?: boolean }>();
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const isReleased = !!effectiveReleasedAt;
  const isGraded = !!effectiveGradedAt;
  const canSaveGrade = isTeacher && isGradeMode && !isGraded;
  const canRelease = isTeacher && isGraded && !isReleased;
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

  const handleSaveGrade = useCallback(async () => {
    setIsSavingGrade(true);
    try {
      const res = await fetch('/api/domain/update-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: submission.id, markAsGraded: true }),
      });
      if (res.ok) {
        setLocalGradedAt(new Date().toISOString());
      }
    } finally {
      setIsSavingGrade(false);
    }
  }, [submission.id]);

  const handleReleaseGrade = useCallback(() => {
    const formData = new FormData();
    formData.append('submissionIds', submission.id);
    releaseFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/release-grades',
    });
  }, [submission.id, releaseFetcher]);

  // ── Paths ──────────────────────────────────────────────────────────
  const revisePath = sideBySideRevisionEnabled
    ? `/app/submissions/${submission.id}/revise`
    : `/app/documents/${submission.documentId}?revise=1`;
  const editGradePath = `/app/submissions/${submission.id}?edit=1`;
  const viewDocumentHref = useMemo(() => {
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    return `/app/documents/${submission.documentId}?exitTo=${encodeURIComponent(returnUrl)}`;
  }, [location.pathname, location.search, location.hash, submission.documentId]);

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="flex w-full items-center gap-3 border-b bg-white px-3 py-2">
        <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => navigate(exitTarget)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        <div className="flex min-w-0 items-center gap-2">
          {isTeacher && submission.document.profile.user.name ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {submission.document.profile.user.name}
            </span>
          ) : null}
          {isTeacher && submission.document.profile.user.name ? (
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
                  submission.title.trim() ||
                  submission.document.title ||
                  '';
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

        <Badge variant={statusVariant} className="shrink-0">{statusLabel}</Badge>

        {gradeDisplay && !isPending ? (
          <Badge
            variant="secondary"
            className="shrink-0 border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
          >
            {gradeDisplay}
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {isTeacher ? (
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
          {/* Teacher: Save Grade → Release Grade flow */}
          {canSaveGrade ? (
            <Button
              size="sm"
              variant="default"
              disabled={isSavingGrade}
              onClick={handleSaveGrade}
            >
              {isSavingGrade ? 'Saving...' : 'Save Grade'}
            </Button>
          ) : null}
          {canRelease ? (
            <ConfirmationDialog
              title="Release Grade?"
              description="This will make the grade and all feedback visible to the student. This action cannot be undone."
              confirmText="Release"
              cancelText="Cancel"
              onConfirm={handleReleaseGrade}
            >
              <Button
                size="sm"
                variant="default"
                disabled={isReleasing}
              >
                {isReleasing ? 'Releasing...' : 'Release Grade'}
              </Button>
            </ConfirmationDialog>
          ) : null}
          {isTeacher && isReleased ? (
            <Badge variant="success" className="shrink-0">Released</Badge>
          ) : null}
          {isOwner && !isPending && persistedGrammarIssues.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={studentGrammarHighlightsVisible}
              data-testid="toggle-grammar-highlights"
              onClick={() =>
                setStudentGrammarHighlightsVisible((v) => !v)
              }
            >
              {studentGrammarHighlightsVisible
                ? 'Hide grammar highlights'
                : 'Show grammar highlights'}
            </Button>
          ) : null}
          {/* Student: Revise Essay link */}
          {isOwner && isReleased ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={revisePath}>Revise Essay</Link>
            </Button>
          ) : null}
        </div>
      </nav>

      {isTeacher && submission.archivedAt ? (
        <div
          className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          data-testid="teacher-submission-archived-banner"
          role="status"
        >
          <span className="font-medium">Archived by student.</span>{' '}
          They hid this version from their own list. You can still grade it—make
          sure this is the submission you intend to score.
        </div>
      ) : null}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex grow overflow-hidden">
        {/* Left panel: grading (edit/view toggle for teachers) or view-only summary */}
        <div className="no-scrollbar flex shrink-0 flex-col overflow-hidden border-r bg-white" style={{ width: 380 }}>
          {isTeacher ? (
            <>
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
                <span className="text-sm font-semibold">Grade Summary</span>
                <div className="flex items-center gap-0.5 rounded-full border bg-muted/50 p-0.5">
                  <Button
                    size="sm"
                    variant={isGradeMode ? 'secondary' : 'ghost'}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set('edit', '1');
                      setSearchParams(params, { replace: true });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={!isGradeMode ? 'secondary' : 'ghost'}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set('edit', '0');
                      setSearchParams(params, { replace: true });
                    }}
                  >
                    View
                  </Button>
                </div>
              </div>
              <div className="no-scrollbar grow overflow-y-auto">
                {isGradeMode ? (
                  <TeacherGradingPanel
                    documentId={submission.documentId}
                    submissionId={submission.id}
                    existingGrade={teacherExistingGrade}
                    grammarIssues={grammarIssues}
                    hiddenGrammarIssueIds={hiddenGrammarIssueIds}
                    onToggleGrammarIssue={toggleGrammarIssueVisibility}
                    onRemoveGrammarIssue={handleRemoveGrammarIssue}
                    onGrammarIssuesChange={handleGrammarIssuesChange}
                    onAiGradingComplete={handleAiGradingComplete}
                  />
                ) : (
                  <ViewPanel submission={submissionForView} />
                )}
              </div>
            </>
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
          {isTeacher && essayElement ? (
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
        <div className="no-scrollbar shrink-0 overflow-y-auto border-l bg-white" style={{ width: 320 }}>
          <GradingCommentsSidebar
            submissionComments={isPending ? [] : (comments as any)}
            submissionId={submission.id}
            sourceText={submission.text ?? ''}
            readOnly={!isTeacher}
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
      {!isPending && activeGrammarIssues.length > 0 && tooltipPos ? (() => {
        const currentIssue = activeGrammarIssues[tooltipPage] ?? activeGrammarIssues[0];
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
                  {currentIssue.kind === 'error' ? 'Grammar Error' : 'Style Suggestion'}
                </p>
              </div>
              {hasMultiple ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded text-purple-500 hover:bg-purple-100"
                    onClick={() => setTooltipPage((p) => (p - 1 + activeGrammarIssues.length) % activeGrammarIssues.length)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-purple-500">{tooltipPage + 1}/{activeGrammarIssues.length}</span>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded text-purple-500 hover:bg-purple-100"
                    onClick={() => setTooltipPage((p) => (p + 1) % activeGrammarIssues.length)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm leading-snug select-text">{currentIssue.message}</p>
            {currentIssue.rule ? (
              <p className="mt-1.5 text-xs text-muted-foreground select-text border-t pt-1.5">Rule: {currentIssue.rule}</p>
            ) : null}
          </div>
        );
      })() : null}
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
        <p className="mt-0.5 text-sm italic text-muted-foreground">Pending grade</p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Feedback</h3>
        <p className="mt-0.5 text-sm italic text-muted-foreground">Pending feedback</p>
      </div>
    </div>
  );
}

// ── View Panel (read-only grade fields for student / view mode) ───────

function ViewPanel({
  submission,
}: {
  submission: {
    numericPercentage: number | null;
    letterGrade: string | null;
    overallComment: string | null;
    rubricScores: unknown;
  };
}) {
  const rawRubric = (submission.rubricScores ?? {}) as Record<string, number | { score: number; comment?: string }>;
  const rubricEntries = Object.entries(rawRubric).map(([key, val]) => {
    const score = typeof val === 'object' && val !== null ? (val as { score: number }).score : (val as number);
    const comment = typeof val === 'object' && val !== null ? (val as { comment?: string }).comment : undefined;
    return { key, score, comment };
  });
  const hasGrade = submission.numericPercentage != null;

  return (
    <div className="p-4 space-y-4">
      {hasGrade ? (
        <>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Overall Grade</h3>
            <p className="text-2xl font-semibold">
              {submission.numericPercentage}%
              {submission.letterGrade ? ` (${submission.letterGrade})` : ''}
            </p>
          </div>
          {submission.overallComment ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Overall Feedback</h3>
              <p className="mt-1 text-sm whitespace-pre-wrap">{submission.overallComment}</p>
            </div>
          ) : null}
          {rubricEntries.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Rubric</h3>
              <Accordion type="multiple" className="mt-2">
                {rubricEntries.map(({ key, score, comment }) => (
                  <AccordionItem key={key} value={key} className="border-b last:border-0">
                    <AccordionTrigger className="py-2 text-sm hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-2">
                        <span className="font-medium">{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                        <span className="text-muted-foreground">{score}/5</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {comment ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{comment}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No feedback for this category</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">Not yet graded</p>
          <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[200px]">
            Your grade will appear here once the teacher has reviewed your submission.
          </p>
        </div>
      )}
    </div>
  );
}
