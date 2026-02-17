import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
  Link,
} from 'react-router';
import { ArrowLeft, Check, Loader2, AlertCircle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useUser } from '~/hooks/useUser';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { isGradingAssistantEnabledForOrg } from '~/utils/featureFlags.server';
import { FEATURE_FLAGS, getFeatureFlag } from '~/utils/feature-flags.server';
import { Comments } from './comments';
import { CommentsSelectionProvider } from './comments/selection-context';
import { Editor } from './editor/index';
import { Tutor } from './tutor';
import { DocumentVersions } from './_components/document-versions';
import {
  DocumentStatusBadge,
  getDocumentStatusLabel,
} from '~/components/document-status-badge';
import { cn } from '~/utils/misc';
import { formatGrade } from '~/domain/grading/gradeMath';
import { TeacherGradingPanel } from './_components/teacher-grading-panel';
import { GradingCommentsSidebar } from './_components/grading-comments-sidebar';

type GrammarIssue = {
  id: string;
  excerpt: string;
  occurrence?: number;
  kind: 'error' | 'style';
  ruleNumber?: number;
  rule?: string;
  message: string;
};

function parseGrammarIssues(raw: unknown): GrammarIssue[] {
  if (!raw || typeof raw !== 'object') return [];
  const issues = (raw as { issues?: unknown[] }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.filter(
    (issue): issue is GrammarIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      typeof (issue as GrammarIssue).id === 'string' &&
      typeof (issue as GrammarIssue).excerpt === 'string' &&
      typeof (issue as GrammarIssue).message === 'string'
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id found');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const url = new URL(request.url);
  const shouldSaveVersion = url.searchParams.get('ssv') === '1';
  const cmsIdx = parseInt(url.searchParams.get('cmsIdx') ?? '0') || 0;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const doc = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...(user?.isAdmin
        ? {}
        : {
            OR: [
              { profile: { id: profile.id } },
              {
                profile: {
                  studentProfile: {
                    classes: {
                      some: {
                        teachers: {
                          some: {
                            profileId: profile.id,
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      createdAt: true,
      title: true,
      html: true,
      text: true,
      submittedAt: true,
      submittedSnapshotId: true,
      submittedSnapshot: {
        select: {
          id: true,
          html: true,
          text: true,
          grades: {
            select: {
              id: true,
              score: true,
              feedback: true,
              overallScore: true,
              overallComment: true,
              numericPercentage: true,
              letterGrade: true,
              grammarIssues: true,
              rubricScores: true,
              releasedAt: true,
              createdAt: true,
            },
            take: 1,
          },
        },
      },
      versions: { orderBy: { createdAt: 'desc' } },
      profile: { include: { user: { select: { name: true } } } },
      studentCourseModuleSessions: {
        orderBy: { studentCourseModule: { position: 'desc' } },
        include: {
          studentCourseModule: {
            include: {
              instructions: {
                orderBy: { position: 'asc' },
                include: {
                  buttons: {
                    orderBy: { position: 'asc' },
                  },
                },
              },
              studentCourse: {
                select: {
                  studentCourseModules: {
                    select: { id: true, position: true },
                    orderBy: { position: 'asc' },
                  },
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      comments: {
        include: {
          profile: { include: { user: { select: { name: true } } } },
          responses: {
            include: {
              profile: { include: { user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!doc) {
    return redirectWithToast('/app', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  if (shouldSaveVersion) {
    const latestVersion = doc.versions[0];
    if (doc.html && doc.text && latestVersion?.html !== doc.html) {
      prisma.documentVersion
        .create({
          data: { documentId: doc.id, html: doc.html, text: doc.text },
        })
        .catch(() => {});
    }
  }

  let currentCms = doc.studentCourseModuleSessions[cmsIdx];

  if (!currentCms) {
    currentCms = doc.studentCourseModuleSessions[0];
  }

  if (!currentCms) {
    return redirectWithToast('/app', {
      description: 'No course module session found.',
      type: 'error',
    });
  }

  const nextCmId =
    currentCms.studentCourseModule.studentCourse?.studentCourseModules.find(
      (cm) => cm.position === currentCms.studentCourseModule.position + 1
    )?.id;

  const isDocumentSubmissionEnabled = await getFeatureFlag(
    FEATURE_FLAGS.DOCUMENT_SUBMISSION
  );

  const gradeId = doc.submittedSnapshot?.grades?.[0]?.id;
  const gradeComments =
    gradeId != null
      ? await prisma.gradeComment.findMany({
          where: { gradeId },
          include: {
            profile: {
              include: { user: { select: { name: true, email: true } } },
            },
            responses: {
              include: {
                profile: {
                  include: { user: { select: { name: true, email: true } } },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

  return dataResponse({
    doc,
    currentCms,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: doc.studentCourseModuleSessions[cmsIdx + 1] !== undefined,
    gradingAssistantEnabled: isGradingAssistantEnabledForOrg(
      profile.organization.id
    ),
    isDocumentSubmissionEnabled,
    gradeComments,
  });
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const fetcher = useFetcher();
  const submitFetcher = useFetcher();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [showOldComments, setShowOldComments] = useState(false);
  const [hasEditorContent, setHasEditorContent] = useState(
    !!(data.doc.html && data.doc.text)
  );
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const [exitTarget, setExitTarget] = useState(
    searchParams.get('exitTo') || '/app'
  );
  const tab = searchParams.get('tab') ?? 'tutor';
  const leftPanel = searchParams.get('left') ?? 'tutor';
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;
  const isSubmitting = submitFetcher.state !== 'idle';
  const isSubmitted = data.doc.submittedAt !== null;
  const grade = data.doc.submittedSnapshot?.grades?.[0];
  const documentStatusLabel = getDocumentStatusLabel({
    submittedAt: data.doc.submittedAt,
    grade: grade ?? null,
  });
  const isGradeReleased =
    grade?.releasedAt !== null && grade?.releasedAt !== undefined;
  const gradingAssistantEnabled = data.gradingAssistantEnabled;
  const canUseGradingPanel =
    data.isDocumentSubmissionEnabled &&
    gradingAssistantEnabled &&
    isViewingAsTeacher &&
    isSubmitted;
  const isTeacherGradingTabOpen = canUseGradingPanel && leftPanel === 'grading';
  const isDocumentEditable = !isViewingAsTeacher;
  const gradeDisplay =
    (grade
      ? formatGrade(
          grade.numericPercentage ?? null,
          grade.letterGrade ?? null
        ) ||
        grade.score ||
        (grade.overallScore ? `${grade.overallScore}/5` : null)
      : null) ?? null;
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<
    string | null
  >(null);
  const [tooltipIssueId, setTooltipIssueId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const closeTooltipTimer = useRef<number | null>(null);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>(
    parseGrammarIssues(grade?.grammarIssues)
  );
  const [hiddenGrammarIssueIds, setHiddenGrammarIssueIds] = useState<string[]>(
    []
  );
  const allComments = (data.doc.comments as any[]) ?? [];
  const activeComments = allComments.filter((c) => !c.archivedAt);
  const archivedComments = allComments.filter((c) => !!c.archivedAt);
  const visibleComments = isSubmitted
    ? showOldComments
      ? [...activeComments, ...archivedComments]
      : activeComments
    : activeComments;
  const teacherHeaderTitle = data.doc.title?.trim() || 'Untitled document';
  const studentName = data.doc.profile.user.name?.trim() || 'Unknown student';
  const visibleGrammarIssues = useMemo(
    () =>
      grammarIssues.filter(
        (issue) => !hiddenGrammarIssueIds.includes(issue.id)
      ),
    [grammarIssues, hiddenGrammarIssueIds]
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
  const editorGradeHighlights = useMemo(() => {
    if (!isTeacherGradingTabOpen) return undefined;

    const commentHighlights = (data.gradeComments as any[]).map((comment) => ({
      id: comment.id,
      excerpt: comment.excerpt,
      occurrence: comment.occurrence,
      dataAttr: 'data-grade-comment-id' as const,
      className: 'grade-comment-mark' as const,
    }));
    const grammarHighlights = visibleGrammarIssues.map((issue) => ({
      id: issue.id,
      excerpt: issue.excerpt,
      occurrence: issue.occurrence ?? 1,
      dataAttr: 'data-grammar-issue-id' as const,
      className: 'grammar-issue' as const,
    }));

    return [...commentHighlights, ...grammarHighlights];
  }, [data.gradeComments, isTeacherGradingTabOpen, visibleGrammarIssues]);

  const changeTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params);
  };

  const changeLeftPanel = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('left', value);
    setSearchParams(params);
  };

  useEffect(() => {
    setGrammarIssues(parseGrammarIssues(grade?.grammarIssues));
  }, [grade?.id, grade?.grammarIssues]);

  useEffect(() => {
    setHiddenGrammarIssueIds((prev) =>
      prev.filter((id) => grammarIssues.some((issue) => issue.id === id))
    );
  }, [grammarIssues]);

  useEffect(() => {
    if (!tooltipIssueId) return;
    if (visibleGrammarIssues.some((issue) => issue.id === tooltipIssueId))
      return;
    setTooltipIssueId(null);
    setTooltipRect(null);
  }, [tooltipIssueId, visibleGrammarIssues]);

  useEffect(() => {
    if (!isTeacherGradingTabOpen || !activeGradeCommentId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const clickedInHighlight = target.closest('[data-grade-comment-id]');
      const clickedInCommentCard = target.closest('[data-grade-comment-card]');
      if (clickedInHighlight || clickedInCommentCard) return;
      setActiveGradeCommentId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeGradeCommentId, isTeacherGradingTabOpen]);

  const activeGrammarIssue = useMemo(() => {
    if (!tooltipIssueId) return null;
    return grammarIssues.find((issue) => issue.id === tooltipIssueId) ?? null;
  }, [grammarIssues, tooltipIssueId]);

  useEffect(() => {
    if (!tooltipRect) {
      setTooltipPos(null);
      return;
    }
    setTooltipPos({
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    });
  }, [tooltipRect]);

  useEffect(() => {
    if (data.shouldSaveVersion) {
      const { pathname, search } = window.location;
      const searchParams = new URLSearchParams(search);
      searchParams.delete('ssv');
      navigate(`${pathname}?${searchParams}`, { replace: true });
    }
  }, [data.shouldSaveVersion, navigate]);

  useEffect(() => {
    if (submitFetcher.state === 'idle' && submitFetcher.data) {
      if (submitFetcher.data.success) {
        toast.success(
          submitFetcher.data.message || 'Essay submitted successfully!'
        );
        setIsFinalizeDialogOpen(false);
        // Reload the page to reflect the new submission status
        navigate(window.location.pathname + window.location.search, {
          replace: true,
        });
      }
    }
  }, [submitFetcher.state, submitFetcher.data, navigate]);

  useEffect(() => {
    const explicitExitTo = searchParams.get('exitTo');
    if (explicitExitTo) {
      setExitTarget(explicitExitTo);
      return;
    }

    if (typeof window === 'undefined') return;
    if (!document.referrer) return;

    try {
      const currentUrl = new URL(window.location.href);
      const referrerUrl = new URL(document.referrer);
      const isSameOrigin = currentUrl.origin === referrerUrl.origin;
      const isSamePath = currentUrl.pathname === referrerUrl.pathname;

      if (isSameOrigin && !isSamePath) {
        setExitTarget(
          `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`
        );
      }
    } catch {
      // Ignore malformed referrer values.
    }
  }, [searchParams]);

  useEffect(() => {
    const handleEditorReady = (event: Event) => {
      const customEvent = event as CustomEvent;
      const getContent = customEvent.detail?.getContent;
      if (!getContent) return;

      // Check content immediately
      const content = getContent();
      setHasEditorContent(!!(content?.html && content?.text));

      // Set up interval to check content
      const interval = setInterval(() => {
        const currentContent = getContent();
        setHasEditorContent(!!(currentContent?.html && currentContent?.text));
      }, 500);

      return () => clearInterval(interval);
    };

    window.addEventListener('editor-ready', handleEditorReady);
    return () => window.removeEventListener('editor-ready', handleEditorReady);
  }, []);

  return (
    <>
      <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
        <nav className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 border-b px-3 py-2">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(exitTarget)}
            >
              <ArrowLeft className="h-4" />
              Exit
            </Button>
            {isViewingAsTeacher ? (
              <p className="text-xs font-semibold text-foreground md:text-md">
                {teacherHeaderTitle}
                <span className="px-2 text-muted-foreground">&bull;</span>
                <span className="font-medium text-muted-foreground">
                  {studentName}
                </span>
                <span className="px-2 text-muted-foreground">&bull;</span>
                <span className="font-medium text-muted-foreground">
                  {documentStatusLabel}
                </span>
              </p>
            ) : (
              <Input
                size="sm"
                className="rounded-lg border border-transparent font-bold transition hover:border-border"
                defaultValue={data.doc.title}
                placeholder="Untitled document"
                onBlur={(e) =>
                  e.target.value !== data.doc.title
                    ? fetcher.submit(
                        {
                          title: e.target.value,
                          text: data.doc.text,
                          html: data.doc.html,
                        },
                        {
                          method: 'POST',
                          action: `/api/model/document/${data.doc.id}?from=title-input`,
                        }
                      )
                    : undefined
                }
              />
            )}
          </div>
          {!isViewingAsTeacher && (
            <div className="flex items-center gap-2">
              <DocumentStatusBadge
                submittedAt={data.doc.submittedAt}
                grade={grade ?? null}
              />
              {isSubmitted ? (
                <span className="text-xs text-muted-foreground">
                  {isGradeReleased && grade?.releasedAt
                    ? new Date(grade.releasedAt).toLocaleDateString()
                    : new Date(data.doc.submittedAt!).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          )}
          <div className="ml-auto flex items-center gap-4">
            {!isViewingAsTeacher && data.isDocumentSubmissionEnabled && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting || !hasEditorContent}
                  onClick={() => setIsFinalizeDialogOpen(true)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : isSubmitted ? (
                    'Submit again'
                  ) : (
                    'Submit'
                  )}
                </Button>
                {!isTeacherGradingTabOpen ? (
                  <div className="h-[20px] border-r" />
                ) : null}
              </>
            )}
            {isSubmitted && archivedComments.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowOldComments((v) => !v)}
                >
                  {showOldComments ? 'Hide old comments' : 'Show old comments'}
                </Button>
                <div className="h-[20px] border-r" />
              </>
            )}
            {isViewingAsTeacher && isSubmitted && (
              <>
                {grade ? (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/app/graded/${grade.id}`}>
                        Open Graded View
                      </Link>
                    </Button>
                    <div className="h-[20px] border-r" />
                  </>
                ) : null}
              </>
            )}
            {!isTeacherGradingTabOpen ? (
              <div className="flex w-[135px] items-center gap-4">
                {isSaving ? (
                  <div className="flex items-center gap-1 text-muted-foreground/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-sm">Saving</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-muted-foreground/70">
                    <Check className="h-4 w-4" />
                    <p className="mr-2 text-sm">Saved</p>
                  </div>
                )}
                <div className="h-[20px] border-r" />
                <DocumentVersions documentId={data.doc.id} />
              </div>
            ) : null}
            {isViewingAsTeacher && isSubmitted && (
              <>
                {isTeacherGradingTabOpen ? null : (
                  <div className="h-[20px] border-r" />
                )}
                <div className="hidden md:flex items-center gap-1 rounded-full border bg-muted/40 p-1">
                  <Button
                    size="sm"
                    variant={leftPanel === 'tutor' ? 'secondary' : 'ghost'}
                    onClick={() => changeLeftPanel('tutor')}
                  >
                    Tutor
                  </Button>
                  {gradingAssistantEnabled ? (
                    <Button
                      size="sm"
                      variant={leftPanel === 'grading' ? 'secondary' : 'ghost'}
                      onClick={() => changeLeftPanel('grading')}
                    >
                      Grading
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </nav>
        {grade &&
          !isTeacherGradingTabOpen &&
          ((!isViewingAsTeacher && isGradeReleased) || isViewingAsTeacher) && (
            <div className="mx-auto w-full max-w-screen-2xl border-b bg-green-50 dark:bg-green-950/20 px-3 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={isGradeReleased ? 'success' : 'secondary'}>
                    {isGradeReleased
                      ? 'Grade Released'
                      : 'Graded (Not Released)'}
                  </Badge>
                  <span className="text-sm font-medium">
                    {gradeDisplay || 'Graded'}
                  </span>
                </div>
                {(grade.feedback || grade.overallComment) && (
                  <div className="flex-1 sm:mx-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {grade.overallComment || grade.feedback}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="bg-white dark:bg-background"
                  >
                    <Link to={`/app/graded/${grade.id}`}>Open Graded View</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        <Tabs onValueChange={changeTab} value={tab} className="md:hidden">
          <TabsList className="w-full rounded-none border-b px-3">
            <TabsTrigger value="tutor" className="w-full">
              Tutor
            </TabsTrigger>
            <TabsTrigger value="editor" className="w-full">
              Editor
            </TabsTrigger>
            <TabsTrigger value="comments" className="w-full">
              Comments
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <CommentsSelectionProvider>
          <div
            className={cn(
              'mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden',
              isTeacherGradingTabOpen && 'draft-comments-hidden'
            )}
          >
            {isMobile && tab !== 'tutor' ? null : canUseGradingPanel &&
              leftPanel === 'grading' ? (
              <TeacherGradingPanel
                documentId={data.doc.id}
                existingGrade={grade ?? null}
                grammarIssues={grammarIssues}
                hiddenGrammarIssueIds={hiddenGrammarIssueIds}
                onToggleGrammarIssue={toggleGrammarIssueVisibility}
                onGrammarIssuesChange={handleGrammarIssuesChange}
              />
            ) : (
              <Tutor
                docId={data.doc.id}
                cms={data.currentCms}
                nextCmId={data.nextCmId}
                hasPreviousCms={data.hasPreviousCms}
              />
            )}
            {isMobile && tab !== 'editor' ? null : (
              <Editor
                docId={data.doc.id}
                docHtml={data.doc.html}
                setIsSaving={setIsSaving}
                isEditable={isDocumentEditable}
                gradeHighlights={editorGradeHighlights}
                activeGradeCommentId={
                  isTeacherGradingTabOpen ? activeGradeCommentId : null
                }
                onGradeCommentSelect={
                  isTeacherGradingTabOpen
                    ? (id) => setActiveGradeCommentId(id)
                    : undefined
                }
                onGrammarIssueHover={
                  isTeacherGradingTabOpen
                    ? (id, rect) => {
                        if (id && rect) {
                          if (closeTooltipTimer.current) {
                            window.clearTimeout(closeTooltipTimer.current);
                          }
                          setTooltipIssueId(id);
                          setTooltipRect(rect);
                          return;
                        }

                        closeTooltipTimer.current = window.setTimeout(() => {
                          setTooltipIssueId(null);
                          setTooltipRect(null);
                        }, 120);
                      }
                    : undefined
                }
              />
            )}
            {isMobile && tab !== 'comments' ? null : isTeacherGradingTabOpen ? (
              <GradingCommentsSidebar
                gradeComments={data.gradeComments}
                gradeId={grade?.id ?? null}
                activeGradeCommentId={activeGradeCommentId}
                onSelectGradeComment={setActiveGradeCommentId}
              />
            ) : (
              <Comments
                comments={visibleComments as any}
                readOnly={isViewingAsTeacher}
              />
            )}
          </div>
        </CommentsSelectionProvider>
      </main>
      {data.isDocumentSubmissionEnabled && (
        <Dialog
          open={isFinalizeDialogOpen}
          onOpenChange={setIsFinalizeDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                {isSubmitted ? 'Resubmit Essay' : 'Submit Essay'}
              </DialogTitle>
              <DialogDescription className="space-y-3 pt-2">
                <p>Before you submit, please note the following:</p>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    Submitting creates a snapshot of your essay for your teacher
                    to grade.
                  </li>
                  <li>
                    You can keep editing after you submit, but changes won’t be
                    reflected in what your teacher sees unless you submit again.
                  </li>
                  <li>
                    Your teacher will receive the current version of your
                    document for grading.
                  </li>
                </ul>
                <p className="pt-2 font-medium">
                  Are you sure you want to submit this essay?
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFinalizeDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  submitFetcher.submit(
                    { documentId: data.doc.id },
                    {
                      method: 'POST',
                      action: '/api/domain/submit-document',
                    }
                  );
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finalizing...
                  </>
                ) : (
                  'Finalize Document'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isTeacherGradingTabOpen && activeGrammarIssue && tooltipPos ? (
        <div
          className="fixed z-50 max-w-sm rounded-lg border bg-white p-3 text-sm shadow"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateY(0)',
          }}
          onMouseEnter={() => {
            if (closeTooltipTimer.current) {
              window.clearTimeout(closeTooltipTimer.current);
            }
          }}
          onMouseLeave={() => {
            setTooltipIssueId(null);
            setTooltipRect(null);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {activeGrammarIssue.kind === 'style' ? 'Style' : 'Grammar'}
                {activeGrammarIssue.ruleNumber
                  ? ` • Rule ${activeGrammarIssue.ruleNumber}`
                  : ''}
              </div>
              {activeGrammarIssue.rule ? (
                <div className="text-sm font-medium">
                  {activeGrammarIssue.rule}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => {
                setTooltipIssueId(null);
                setTooltipRect(null);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {activeGrammarIssue.message}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
