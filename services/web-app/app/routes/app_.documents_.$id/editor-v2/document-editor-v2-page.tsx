import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useRouteLoaderData,
  useSearchParams,
  Link,
} from 'react-router';
import type { Route as RootRoute } from '../../../+types/root';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  ExternalLink,
  Archive,
  RotateCcw,
  Clock,
  EllipsisVertical,
  MoreHorizontal,
  PenLine,
  Sparkles,
  Printer,
  Compass,
  MessageCircle,
  PanelLeft,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip } from '~/components/ui/tooltip';
import { Input } from '~/components/ui/input.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import type { PageWidthMode } from './document-editor/toolbar-controls';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useUser } from '~/hooks/useUser';
import { Comments } from './comments';
import { MarginCommentsRail } from './comments/margin-comments-rail';
import { TeacherPasteReport } from '~/components/teacher-paste-report';
import { CommentsSelectionProvider } from './comments/selection-context';
import {
  DocumentEditor,
  EditorLoadingShell,
} from './document-editor/document-editor';
import type { EditorBridge } from './document-editor/use-editor-sync';
import { Tutor } from './tutor/tutor';
import { DocumentHistory } from './document-history/document-history';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import type { SyncStatus } from '~/utils/sync-service';

import { useAuthHeartbeat } from './hooks/use-auth-heartbeat';
import { useCommentsState } from './hooks/use-comments-state';
import { useTutorState } from './hooks/use-tutor-state';
import { useDocumentSubmit } from './hooks/use-document-submit';
import {
  displaySubmissionTitle,
  partitionSubmissionsByArchive,
  versionLabelForActiveSubmission,
} from '~/utils/submission-versions';
import { AssignmentPromptPanel } from './assignment-prompt-panel';
import { pickLatestReleasedSubmission } from '~/utils/document-link-target';
import { cn } from '~/utils/misc';
import { TeacherDocumentNavigation } from '~/components/teacher-document-navigation';
import {
  buildDocumentNavigationHref,
  GRADING_QUEUE_SORT_PARAM,
  parseGradingQueueScope,
  parseGradingQueueSort,
} from '~/domain/grading/grading-queue';
import {
  GuidedTour,
  startPageTour,
} from '~/components/guided-tour/guided-tour';
import type { loader, SubmissionRow } from '../route';
import {
  STUDENT_UNSUBMIT_BLOCKED_TOOLTIP,
  AssignmentPromptStrip,
  getGenericAssignmentPromptForEditor,
  isTutorEnabledForAssignment,
} from '../route';
import './document-editor/document-editor-redesign.css';

const SUBMIT_EMPTY_TOOLTIP =
  "You can't submit an empty document. Add text first.";

function escapePrintHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function sortDocumentCommentsByMarkupOrder<
  T extends { id: string; createdAt: Date | string },
>(items: T[], html: string | null | undefined) {
  if (!html) {
    return [...items].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  const orderByCommentId = new Map<string, number>();
  const regex = /data-comment-id=(['"])(.*?)\1/g;
  let order = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const commentId = match[2];
    if (!orderByCommentId.has(commentId)) {
      orderByCommentId.set(commentId, order);
      order += 1;
    }
  }

  return [...items].sort((a, b) => {
    const aOrder = orderByCommentId.get(a.id);
    const bOrder = orderByCommentId.get(b.id);

    if (aOrder != null && bOrder != null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (aOrder != null) return -1;
    if (bOrder != null) return 1;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

// Shared with the post-backfill refetch below so a session created on demand
// comes back in the same shape as one loaded on the initial document query.
const assignmentModuleSessionsOrderBy = [
  { assignmentModule: { position: 'asc' as const } },
  { createdAt: 'desc' as const },
];

const assignmentModuleSessionsInclude = {
  assignmentModule: {
    include: {
      instructions: {
        omit: { answerKey: true },
        orderBy: { position: 'asc' as const },
        include: {
          buttons: {
            orderBy: { position: 'asc' as const },
          },
        },
      },
      assignmentType: {
        select: {
          assignmentModules: {
            where: { deletedAt: null },
            select: { id: true, position: true },
            orderBy: { position: 'asc' as const },
          },
        },
      },
    },
  },
  messages: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
};

export function DocumentEditorV2Page() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const isReadOnlyImpersonation =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root')
      ?.impersonation?.isReadOnly ?? false;
  const showGuidedTour = data.guidedTours != null && !isReadOnlyImpersonation;
  const fetcher = useFetcher();
  const submissionUnsubmitFetcher = useFetcher();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [uiMounted, setUiMounted] = useState(false);
  useEffect(() => setUiMounted(true), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [mobileTutorSheetOpen, setMobileTutorSheetOpen] = useState(false);
  const [mobileCommentsSheetOpen, setMobileCommentsSheetOpen] = useState(false);
  const [submissionTitle, setSubmissionTitle] = useState('');
  const [showOldComments, setShowOldComments] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [submissionToUnsubmit, setSubmissionToUnsubmit] =
    useState<SubmissionRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localSubmissions, setLocalSubmissions] = useState<SubmissionRow[]>([]);
  // This route's own loader never revalidates on fetcher submissions (see
  // shouldRevalidate below) — server state flows through explicit local
  // state updates, not revalidator.revalidate(). Track ids the student just
  // unsubmitted so the submissions list/badge update immediately.
  const [locallyUnsubmittedIds, setLocallyUnsubmittedIds] = useState<
    Set<string>
  >(new Set());
  const isMobile =
    uiMounted && ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [pageWidth, setPageWidth] = useLocalStorage<PageWidthMode>(
    `doc-${data.doc.id}-page-width`,
    'fit'
  );
  const [desktopTutorOpen, setDesktopTutorOpen] = useLocalStorage(
    `doc-${data.doc.id}-panel-tutor`,
    true
  );
  const [desktopCommentsOpen, setDesktopCommentsOpen] = useLocalStorage(
    `doc-${data.doc.id}-panel-comments`,
    true
  );
  const classSubtitle = useMemo(() => {
    const cls = data.doc.classAssignment?.class;
    if (!cls) return null;
    const title = cls.title?.trim() ?? '';
    const periodLabel = cls.period?.trim()
      ? `Period ${cls.period.trim()}`
      : null;
    let label = title;
    if (periodLabel) {
      const periodAlreadyInTitle =
        title.includes(periodLabel) ||
        title.toLowerCase().includes(cls.period!.trim().toLowerCase());
      label = periodAlreadyInTitle
        ? title
        : title
          ? `${title} · ${periodLabel}`
          : periodLabel;
    }
    return label || null;
  }, [data.doc.classAssignment?.class]);
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackCmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const cmsIdx =
    typeof data.currentCmsIdx === 'number' && data.currentCmsIdx >= 0
      ? data.currentCmsIdx
      : fallbackCmsIdx;
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tutorEnabled = isTutorEnabledForAssignment(data.doc.assignment);
  const defaultMobileTab = 'editor';
  const defaultDesktopTab = tutorEnabled ? 'tutor' : 'editor';
  const tab =
    searchParams.get('tab') ?? (isMobile ? defaultMobileTab : defaultDesktopTab);
  const isViewingAsTeacher = Boolean(
    data.doc &&
      (data.isTeacherAssignmentPreview ||
        user.id !== data.doc.membership.userId)
  );
  // A teacher working through their own "Try it" preview does what a student
  // does: write, then submit. Grading it happens from the submission page.
  const isOwnTeacherPreview = Boolean(
    data.isTeacherAssignmentPreview && user.id === data.doc.membership.userId
  );
  useEffect(() => {
    if (!uiMounted) return;
    if (isViewingAsTeacher && !isOwnTeacherPreview) {
      setDesktopCommentsOpen(true);
    }
  }, [
    uiMounted,
    isViewingAsTeacher,
    isOwnTeacherPreview,
    setDesktopCommentsOpen,
  ]);
  const showSubmitControls = !isViewingAsTeacher || isOwnTeacherPreview;
  const isDocumentOwner = user.id === data.doc.membership.userId;
  // Students and teachers in "Try it" preview edit; grading teachers view-only.
  const isDocumentEditable =
    isDocumentOwner || isOwnTeacherPreview;
  const assignment = data.doc.assignment;
  // A student practice document carries its own snapshot; a teacher-assigned
  // document inherits it from the assignment.
  const editorAssignmentPrompt = getGenericAssignmentPromptForEditor(
    assignment,
    null
  );

  // Merge server + optimistic submissions
  const submissions = useMemo(() => {
    const serverSubs = (data.submissions ?? []) as SubmissionRow[];
    const serverIds = new Set(serverSubs.map((s) => s.id));
    const newLocal = localSubmissions.filter((s) => !serverIds.has(s.id));
    const merged = [...newLocal, ...serverSubs];
    if (locallyUnsubmittedIds.size === 0) return merged;
    return merged.map((s) =>
      locallyUnsubmittedIds.has(s.id) && s.unsubmittedAt == null
        ? { ...s, unsubmittedAt: new Date().toISOString() }
        : s
    );
  }, [data.submissions, localSubmissions, locallyUnsubmittedIds]);

  const { active: activeSubmissions, archived: archivedSubmissions } = useMemo(
    () => partitionSubmissionsByArchive(submissions),
    [submissions]
  );

  const studentList = isViewingAsTeacher ? submissions : activeSubmissions;
  const submissionCountForBadge = activeSubmissions.length;

  const isSubmitted = activeSubmissions.length > 0;
  const hasAnySubmissionRecord = submissions.length > 0;
  const gradedCount = activeSubmissions.filter((s) => s.releasedAt).length;
  const versionNumber = activeSubmissions.length + 1;
  const submissionPreview = data.submissionPreview ?? null;
  const viewingSubmission = submissionPreview != null;
  const editorServerHtml = viewingSubmission
    ? submissionPreview.html
    : (data.doc.html ?? '');
  const editorServerText = viewingSubmission
    ? submissionPreview.text
    : (data.doc.text ?? '');

  // Exit target is computed once on mount (session-storage read is idempotent)
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );

  // Editor bridge handle — stable ref populated by DocumentEditor.onBridgeReady
  const editorBridgeRef = useRef<EditorBridge | null>(null);
  const [editorRoot, setEditorRoot] = useState<HTMLElement | null>(null);
  const handleEditorBridgeReady = useCallback((bridge: EditorBridge | null) => {
    editorBridgeRef.current = bridge;
    setEditorRoot(bridge?.getContentElement?.() ?? null);
  }, []);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const getLiveDocumentTitle = useCallback(() => {
    if (titleInputRef.current) {
      return titleInputRef.current.value;
    }
    return data.doc.title ?? '';
  }, [data.doc.title]);

  // ── Extracted hooks ────────────────────────────────────────────────
  const auth = useAuthHeartbeat({
    documentId: data.doc.id,
    isEditable: isDocumentEditable,
  });
  const tutor = useTutorState(data.currentCms as any, cmsIdx);
  const commentsState = useCommentsState((data.doc.comments as any[]) ?? []);
  const submit = useDocumentSubmit({
    documentId: data.doc.id,
    editorBridgeRef,
    onSubmitted: (newSubmission) => {
      setSubmitConfirmOpen(false);
      setSubmissionTitle('');
      if (titleInputRef.current && newSubmission.title.trim()) {
        titleInputRef.current.value = newSubmission.title;
      }
      setLocalSubmissions((prev) => [
        {
          ...newSubmission,
          gradedAt: null,
          releasedAt: null,
          archivedAt: null,
        },
        ...prev,
      ]);
    },
  });

  const [editorSubmittable, setEditorSubmittable] = useState(() =>
    isDocumentSubmittableContent(editorServerHtml, editorServerText)
  );
  const handleSubmittableContentChange = useCallback((submittable: boolean) => {
    setEditorSubmittable(submittable);
  }, []);

  const isEditorEditable =
    isDocumentEditable &&
    !viewingSubmission &&
    !auth.isLocked &&
    auth.isInitialCheckComplete;
  const commentsReadOnly = !isViewingAsTeacher && !isEditorEditable;

  // ── Derived UI data ────────────────────────────────────────────────
  // Re-sort by document-mark order whenever the comments list changes,
  // so optimistically-added comments slot into the correct position
  // (loader's pre-sort is stale once the user adds a new comment).
  const allComments = useMemo(() => {
    const stateComments = commentsState.comments as any[];
    const liveHtml = editorBridgeRef.current?.getContent().html;
    if (!liveHtml) return stateComments;
    return sortDocumentCommentsByMarkupOrder(stateComments, liveHtml);
  }, [commentsState.comments]);
  const activeComments = allComments.filter((c) => !c.archivedAt);
  const archivedComments = allComments.filter((c) => !!c.archivedAt);
  const visibleComments = hasAnySubmissionRecord
    ? showOldComments
      ? allComments
      : activeComments
    : activeComments;
  const loaderComments = (data.doc.comments as typeof activeComments) ?? [];
  const marginRailComments = useMemo(() => {
    const source =
      activeComments.length > 0
        ? activeComments
        : loaderComments.filter((c) => !c.archivedAt);
  return sortDocumentCommentsByMarkupOrder(source, editorServerHtml);
  }, [activeComments, loaderComments, editorServerHtml]);
  const showDesktopMarginComments =
    !isMobile &&
    (desktopCommentsOpen ||
      (isViewingAsTeacher && !isOwnTeacherPreview) ||
      commentsState.pendingDraft != null ||
      visibleComments.length > 0);
  const studentName =
    data.doc.membership.user.name?.trim() || 'Unknown student';
  const cannotSubmitEmpty = !editorSubmittable;
  const isSubmitting = submit.isSubmitting;
  const submitActionDisabled = isSubmitting || cannotSubmitEmpty;

  const tutorHasPreviousCms = useMemo(() => {
    const liveCmsId = tutor.cms?.id ?? data.currentCms.id;
    return data.hasPreviousCms || liveCmsId !== data.currentCms.id;
  }, [data.hasPreviousCms, data.currentCms.id, tutor.cms?.id]);

  const changeTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params, { replace: true });
  };

  const handleTutorBeforeRespond = useCallback(async () => {
    if (auth.isLocked) return false;
    await editorBridgeRef.current?.saveNow({ source: 'tutor-pre-respond' });
    const isValidSession = await auth.checkAuthSession();
    return isValidSession && !auth.isLocked;
  }, [auth]);

  const handleLoginRedirect = useCallback(() => {
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth/login?redirectTo=${redirectTo}`;
  }, []);

  const openSubmissionInEditor = useCallback(
    (submissionId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('submission', submissionId);
      next.set('tab', 'editor');
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const clearSubmissionView = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('submission');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const latestActiveSubmission = activeSubmissions[0] ?? null;

  const handlePrint = useCallback(() => {
    const liveContent = editorBridgeRef.current?.getContent();
    const rawHtml = liveContent?.html ?? data.doc.html ?? '';
    const title = getLiveDocumentTitle();

    const parser = new DOMParser();
    const parsed = parser.parseFromString(rawHtml, 'text/html');
    parsed.querySelectorAll('[data-comment-id]').forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    const cleanHtml = parsed.body.innerHTML;
    const printDate = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const safeTitle = escapePrintHtml(title || 'Untitled Document');
    const safeStudentName = escapePrintHtml(studentName);
    const safePrintDate = escapePrintHtml(printDate);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.6; color: #000; padding: 1in; }
    header { border-bottom: 1px solid #ccc; padding-bottom: 0.5em; margin-bottom: 1.5em; }
    header h1 { font-size: 18pt; font-weight: bold; margin-bottom: 0.25em; }
    header p { font-size: 10pt; color: #555; }
    h1, h2, h3, h4 { margin: 1em 0 0.5em; }
    p { margin: 0.5em 0; }
    ul, ol { margin: 0.5em 0 0.5em 1.5em; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header>
    <h1>${safeTitle}</h1>
    <p>${safeStudentName} &middot; ${safePrintDate}</p>
  </header>
  <main>${cleanHtml}</main>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
    printWindow.document.close();
  }, [data.doc.html, getLiveDocumentTitle, studentName]);

  useEffect(() => {
    if (submissionUnsubmitFetcher.state !== 'idle') return;
    const body = submissionUnsubmitFetcher.data as
      { success?: boolean } | undefined;
    if (body?.success && submissionToUnsubmit) {
      // The loader's shouldRevalidate never reruns for this fetcher (see
      // below), so update local state directly instead of relying on
      // revalidator.revalidate() to refresh data.submissions.
      const unsubmittedId = submissionToUnsubmit.id;
      setLocallyUnsubmittedIds((prev) => {
        const next = new Set(prev);
        next.add(unsubmittedId);
        return next;
      });
      setSubmissionToUnsubmit(null);
    }
  }, [
    submissionUnsubmitFetcher.state,
    submissionUnsubmitFetcher.data,
    submissionToUnsubmit,
  ]);

  return (
    <>
      <main
        className="doc-editor-frame flex h-screen w-screen flex-col overflow-hidden"
        data-document-editor-version="v2"
      >
        {showGuidedTour ? (
          <GuidedTour {...data.guidedTours!} />
        ) : null}
        <header
          className="doc-editor-header"
          data-testid="document-editor-header"
        >
          <div className="doc-editor-header__title-block">
            <Tooltip text="Back to class" delayDuration={0}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to class"
                data-testid="document-exit-button"
                onClick={() => navigate(exitTarget)}
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </Button>
            </Tooltip>
            <p className="sr-only">
              <button type="button" onClick={() => navigate(exitTarget)}>
                Exit
              </button>
            </p>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Input
                ref={titleInputRef}
                data-testid="document-title-input"
                size="sm"
                className="h-auto border-0 bg-transparent p-0 text-[15px] font-semibold leading-5 text-[#0f172a] shadow-none focus-visible:ring-0"
                defaultValue={data.doc.title}
                placeholder="Untitled document"
                readOnly={!isDocumentEditable}
                onBlur={(e) => {
                  if (!isDocumentEditable) return;
                  if (e.target.value !== data.doc.title) {
                    fetcher.submit(
                      {
                        title: e.target.value,
                      },
                      {
                        method: 'POST',
                        action: `/api/model/document/${data.doc.id}?from=title-input`,
                      }
                    );
                  }
                }}
              />
              <div
                className="flex min-w-0 items-center gap-2 text-xs text-[hsl(50_2.4%_36%)]"
                data-tour="doc-status"
              >
                {classSubtitle ? (
                  <span className="truncate">{classSubtitle}</span>
                ) : null}
                {classSubtitle ? (
                  <span aria-hidden className="text-[hsl(51_7%_82%)]">
                    ·
                  </span>
                ) : null}
                <SaveStatusIndicator status={syncStatus} />
              </div>
            </div>
          </div>
          {isViewingAsTeacher ? (
            <p
              className="shrink-0 text-xs font-medium text-muted-foreground md:text-sm"
              data-testid="document-teacher-student-name"
            >
              {studentName}
            </p>
          ) : null}
          {isViewingAsTeacher && data.documentNavigation ? (
            <TeacherDocumentNavigation
              queue={data.documentNavigation}
              documentId={data.doc.id}
              hrefFor={(entry) =>
                buildDocumentNavigationHref({
                  entry,
                  exitTo: explicitExitTarget,
                  sort: parseGradingQueueSort(
                    searchParams.get(GRADING_QUEUE_SORT_PARAM)
                  ),
                })
              }
              disabled={false}
            />
          ) : null}
          <div className="doc-editor-header__actions">
            {!isMobile ? (
              <div
                role="group"
                aria-label="Panels"
                className="doc-editor-panel-group"
                data-testid="document-panel-toggles"
              >
                {tutorEnabled ? (
                  <button
                    type="button"
                    className="doc-editor-panel-btn"
                    aria-label="Tutor"
                    title="Tutor"
                    aria-pressed={desktopTutorOpen}
                    onClick={() => setDesktopTutorOpen((open) => !open)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="doc-editor-panel-btn"
                  aria-label="Comments"
                  title="Comments"
                  aria-pressed={desktopCommentsOpen}
                  onClick={() => setDesktopCommentsOpen((open) => !open)}
                >
                  <MessageCircle className="h-4 w-4" />
                  {visibleComments.length > 0 ? (
                    <span className="doc-editor-panel-badge">
                      {visibleComments.length}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
            {isViewingAsTeacher && !isOwnTeacherPreview && latestActiveSubmission ? (
              latestActiveSubmission.releasedAt ? (
                <Badge variant="success" className="h-8 px-3 text-sm">
                  Graded
                </Badge>
              ) : (
                <Button size="sm" asChild data-testid="document-grade-button">
                  <Link
                    to={`/app/submissions/${latestActiveSubmission.id}`}
                  >
                    Grade
                  </Link>
                </Button>
              )
            ) : null}
            {showSubmitControls && !viewingSubmission ? (
              <Popover
                open={submitConfirmOpen}
                onOpenChange={(open) => {
                  setSubmitConfirmOpen(open);
                  if (open) {
                    setSubmissionTitle(getLiveDocumentTitle());
                  }
                }}
              >
                <PopoverTrigger asChild>
                  {cannotSubmitEmpty && !isSubmitting ? (
                    <Tooltip text={SUBMIT_EMPTY_TOOLTIP} delayDuration={0}>
                      <span
                        className="inline-flex"
                        data-testid="document-submit-empty-trigger"
                      >
                        <Button
                          size="sm"
                          softDisabled
                          data-testid="document-submit-button"
                          data-tour="doc-submit"
                        >
                          Submit
                        </Button>
                      </span>
                    </Tooltip>
                  ) : (
                    <Button
                      size="sm"
                      disabled={submitActionDisabled && !isSubmitting}
                      loading={isSubmitting}
                      loadingLabel="Submitting…"
                      data-testid="document-submit-button"
                      data-tour="doc-submit"
                    >
                      Submit
                    </Button>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(380px,calc(100vw-2rem))] space-y-4 p-4"
                  data-testid="document-submit-confirm-popover"
                >
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      Submit version {versionNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Submitting creates a snapshot for your teacher. You can keep
                      editing and submit again later.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="submission-title-popover"
                      className="text-sm font-medium"
                    >
                      Submission title
                    </label>
                    <Input
                      id="submission-title-popover"
                      value={submissionTitle}
                      onChange={(e) => setSubmissionTitle(e.target.value)}
                      placeholder="Enter a title for this submission"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubmitConfirmOpen(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    {cannotSubmitEmpty && !isSubmitting ? (
                      <Tooltip text={SUBMIT_EMPTY_TOOLTIP} delayDuration={0}>
                        <span data-testid="document-finalize-submit-empty-trigger">
                          <Button size="sm" softDisabled data-testid="document-finalize-submit">
                            Submit
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Button
                        size="sm"
                        disabled={submitActionDisabled || isSubmitting}
                        loading={isSubmitting}
                        data-testid="document-finalize-submit"
                        onClick={() => {
                          const title =
                            submissionTitle.trim() || getLiveDocumentTitle().trim();
                          void submit.submitNow(title);
                        }}
                      >
                        Submit
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  aria-label="More document actions"
                  data-testid="document-actions-menu"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {hasAnySubmissionRecord ? (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Submissions ({submissionCountForBadge})
                    </div>
                    <div className="max-h-48 overflow-y-auto border-y">
                      {studentList.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-muted-foreground">
                          No active submissions.
                        </p>
                      ) : (
                        studentList.map((s) => {
                          const isArchived = s.archivedAt != null;
                          const v = !isArchived
                            ? versionLabelForActiveSubmission(
                                activeSubmissions,
                                s.id
                              )
                            : null;
                          const label = displaySubmissionTitle(
                            s.title,
                            v,
                            'Untitled submission'
                          );
                          const isGraded =
                            s.unsubmittedAt == null && s.releasedAt != null;
                          return (
                            <DropdownMenuItem
                              key={s.id}
                              className="flex items-center justify-between gap-2"
                              onSelect={() => openSubmissionInEditor(s.id)}
                            >
                              <span className="truncate text-sm">{label}</span>
                              <Badge
                                variant={isGraded ? 'success' : 'secondary'}
                                className="shrink-0 text-[10px]"
                              >
                                {isGraded ? 'Graded' : 'Submitted'}
                              </Badge>
                            </DropdownMenuItem>
                          );
                        })
                      )}
                    </div>
                    {!isViewingAsTeacher && archivedSubmissions.length > 0 ? (
                      <DropdownMenuItem onSelect={() => setArchiveDialogOpen(true)}>
                        <Archive className="mr-2 h-4 w-4" />
                        Archived submissions
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
                {hasAnySubmissionRecord && archivedComments.length > 0 ? (
                  <DropdownMenuItem
                    onSelect={() => setShowOldComments((v) => !v)}
                  >
                    {showOldComments ? 'Hide old comments' : 'Show old comments'}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="gap-2"
                  data-testid="document-action-history"
                  onSelect={() => setHistoryOpen(true)}
                >
                  <Clock className="h-4 w-4" />
                  History
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  data-testid="document-action-print"
                  onSelect={handlePrint}
                >
                  <Printer className="h-4 w-4" />
                  Print
                </DropdownMenuItem>
                {showGuidedTour ? (
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={() => startPageTour()}
                  >
                    <Compass className="h-4 w-4" />
                    Tour this page
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <DocumentHistory
              documentId={data.doc.id}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          </div>
        </header>
        <CommentsSelectionProvider>
          <div className="doc-editor-body min-h-0 flex-1 overflow-hidden">
            {!tutorEnabled && !(isMobile && tab !== 'editor') ? (
              <AssignmentPromptPanel assignment={editorAssignmentPrompt} />
            ) : null}
            {!tutorEnabled || (isMobile && tab !== 'tutor') ? null : (
              <Tutor
                className={cn(
                  'doc-editor-tutor md:w-[340px]',
                  !isMobile && !desktopTutorOpen && 'hidden'
                )}
                docId={data.doc.id}
                cms={(tutor.cms ?? data.currentCms) as any}
                cmsIdx={cmsIdx}
                nextCmId={data.nextCmId}
                hasPreviousCms={tutorHasPreviousCms}
                isSessionLocked={auth.isLocked}
                beforeRespond={handleTutorBeforeRespond}
                onCmsUpdate={tutor.updateCms}
                getCurrentDocumentText={() =>
                  editorBridgeRef.current?.getContent().text ??
                  data.doc.text ??
                  ''
                }
                readOnlyTeacherView={
                  isViewingAsTeacher && !isOwnTeacherPreview
                }
                studentDisplayName={studentName}
                onClose={() => setDesktopTutorOpen(false)}
              />
            )}
            {isMobile && tab !== 'editor' && !isViewingAsTeacher ? null : (
              <div
                className={cn(
                  'doc-editor-workspace',
                  isMobile && tab !== 'editor'
                    ? 'hidden'
                    : 'flex h-full min-w-0 w-full flex-col'
                )}
              >
                {uiMounted ? (
                  <DocumentEditor
                    docId={data.doc.id}
                    assignment={tutorEnabled ? editorAssignmentPrompt : null}
                    serverHtml={editorServerHtml}
                    serverText={editorServerText}
                    serverUpdatedAt={data.doc.updatedAt}
                    initialRevision={data.doc.revision}
                    isEditable={isEditorEditable}
                    teacherCommenting={
                      isViewingAsTeacher && !isOwnTeacherPreview
                    }
                    canUploadImages={data.canUploadImages}
                    pageWidth={pageWidth}
                    onPageWidthChange={setPageWidth}
                    snapshotContent={
                      viewingSubmission
                        ? {
                            html: submissionPreview!.html,
                            text: submissionPreview!.text,
                          }
                        : null
                    }
                    submissionViewBanner={
                      viewingSubmission ? (
                        <div
                          className="doc-editor-view-banner"
                          data-testid="document-submission-view-banner"
                        >
                          <span>
                            Viewing submission {submissionPreview!.versionLabel}
                          </span>
                          <button
                            type="button"
                            className="font-semibold text-[hsl(210_50%_30%)] underline-offset-2 hover:underline"
                            onClick={clearSubmissionView}
                          >
                            Back to current draft
                          </button>
                        </div>
                      ) : null
                    }
                    onBridgeReady={handleEditorBridgeReady}
                    onSyncStatusChange={setSyncStatus}
                    onSubmittableContentChange={handleSubmittableContentChange}
                    onCommentDraft={(draft) => {
                      commentsState.setPendingDraft(draft);
                      if (!isMobile) setDesktopCommentsOpen(true);
                    }}
                    onCommentCreated={(c) => {
                      commentsState.addComment(c as any);
                      if (!isMobile) setDesktopCommentsOpen(true);
                    }}
                    marginComments={
                      showDesktopMarginComments ? (
                        <MarginCommentsRail
                          documentId={data.doc.id}
                          comments={marginRailComments as any}
                          pendingDraft={commentsState.pendingDraft}
                          readOnly={commentsReadOnly}
                          onCommentRemoved={commentsState.removeComment}
                          onResponseAdded={commentsState.addResponse}
                          onArchiveChange={commentsState.setCommentArchived}
                          onCommentCreated={(c) =>
                            commentsState.addComment(c as any)
                          }
                          onDraftCancel={() => {
                            const draftId = commentsState.pendingDraft?.id;
                            commentsState.clearPendingDraft();
                            if (draftId) {
                              document
                                .querySelectorAll(
                                  `[data-comment-id="${draftId}"]`
                                )
                                .forEach((mark) => {
                                  const node = mark as HTMLElement;
                                  if (!node.parentNode) return;
                                  while (node.childNodes.length > 0) {
                                    node.parentNode.insertBefore(
                                      node.childNodes[0],
                                      node
                                    );
                                  }
                                  node.parentNode.removeChild(node);
                                });
                            }
                          }}
                          autoFocusReplyCommentId={
                            commentsState.pendingFocusCommentId
                          }
                        />
                      ) : null
                    }
                  />
                ) : (
                  <EditorLoadingShell />
                )}
              </div>
            )}
            {isMobile && tab === 'comments' ? (
              <div className="h-full min-w-0 w-full">
                <TeacherPasteReport
                  key={`${data.doc.id}-mobile-comments`}
                  enabled={isViewingAsTeacher}
                  documentId={data.doc.id}
                  contentRoot={editorRoot}
                  onSelectEvent={() => {
                    changeTab('editor');
                  }}
                >
                  <Comments
                    showCollapsibleHeader={!isViewingAsTeacher}
                    comments={visibleComments as any}
                    readOnly={commentsReadOnly}
                    onCommentRemoved={commentsState.removeComment}
                    onResponseAdded={commentsState.addResponse}
                    onArchiveChange={commentsState.setCommentArchived}
                    autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
                  />
                </TeacherPasteReport>
              </div>
            ) : null}
          </div>
        </CommentsSelectionProvider>
        {isMobile ? (
          <nav
            className="doc-editor-mobile-tabbar"
            role="tablist"
            aria-label="Document panels"
            data-testid="document-mobile-tabbar"
          >
            {tutorEnabled ? (
              <button
                type="button"
                role="tab"
                className="doc-editor-mobile-tab"
                aria-selected={tab === 'tutor'}
                onClick={() => changeTab('tutor')}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                <span>Tutor</span>
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              className="doc-editor-mobile-tab"
              aria-selected={tab === 'editor'}
              onClick={() => changeTab('editor')}
            >
              <PenLine className="h-4 w-4" aria-hidden />
              <span>Write</span>
            </button>
            <button
              type="button"
              role="tab"
              className="doc-editor-mobile-tab"
              aria-selected={tab === 'comments'}
              onClick={() => {
                if (isMobile) {
                  setMobileCommentsSheetOpen(true);
                }
                changeTab('comments');
              }}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              <span>Comments</span>
              {visibleComments.length > 0 ? (
                <span className="doc-editor-mobile-tab-badge">
                  {visibleComments.length}
                </span>
              ) : null}
            </button>
          </nav>
        ) : null}
        {isMobile && tab === 'editor' && tutorEnabled && !isViewingAsTeacher ? (
          <button
            type="button"
            className="doc-editor-mobile-tutor-peek"
            data-testid="mobile-tutor-peek"
            onClick={() => setMobileTutorSheetOpen(true)}
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Tutor · tap to continue</span>
            <span className="doc-editor-mobile-peek-chevron" aria-hidden>
              ›
            </span>
          </button>
        ) : null}
      </main>
      {isMobile ? (
        <>
          <Sheet open={mobileTutorSheetOpen} onOpenChange={setMobileTutorSheetOpen}>
            <SheetContent
              side="bottom"
              className="h-[min(72vh,560px)] overflow-hidden p-0"
              data-testid="mobile-tutor-sheet"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Tutor</SheetTitle>
              </SheetHeader>
              <Tutor
                className="doc-editor-tutor h-full w-full border-0"
                docId={data.doc.id}
                cms={(tutor.cms ?? data.currentCms) as any}
                cmsIdx={cmsIdx}
                nextCmId={data.nextCmId}
                hasPreviousCms={tutorHasPreviousCms}
                isSessionLocked={auth.isLocked}
                beforeRespond={handleTutorBeforeRespond}
                onCmsUpdate={tutor.updateCms}
                getCurrentDocumentText={() =>
                  editorBridgeRef.current?.getContent().text ??
                  data.doc.text ??
                  ''
                }
                readOnlyTeacherView={false}
                studentDisplayName={studentName}
              />
            </SheetContent>
          </Sheet>
          <Sheet
            open={mobileCommentsSheetOpen}
            onOpenChange={setMobileCommentsSheetOpen}
          >
            <SheetContent
              side="bottom"
              className="h-[min(72vh,560px)] overflow-hidden p-0"
              data-testid="mobile-comments-sheet"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Comments</SheetTitle>
              </SheetHeader>
              <div className="h-full overflow-y-auto p-3">
                <Comments
                  showCollapsibleHeader
                  comments={visibleComments as any}
                  readOnly={commentsReadOnly}
                  onCommentRemoved={commentsState.removeComment}
                  onResponseAdded={commentsState.addResponse}
                  onArchiveChange={commentsState.setCommentArchived}
                  autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
      <Dialog
        open={submissionToUnsubmit != null}
        onOpenChange={(open) => {
          if (!open && submissionUnsubmitFetcher.state === 'idle') {
            setSubmissionToUnsubmit(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsubmit this submission?</DialogTitle>
            <DialogDescription>
              This withdraws the submission. Your document stays exactly as it
              is, so you can keep editing and submit it again.
            </DialogDescription>
          </DialogHeader>
          {(
            submissionUnsubmitFetcher.data as
              { success?: boolean; message?: string } | undefined
          )?.success === false ? (
            <p role="alert" className="text-sm text-destructive">
              {(submissionUnsubmitFetcher.data as { message?: string }).message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submissionUnsubmitFetcher.state !== 'idle'}
              onClick={() => setSubmissionToUnsubmit(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                submissionUnsubmitFetcher.state !== 'idle' ||
                submissionToUnsubmit == null
              }
              onClick={() => {
                if (!submissionToUnsubmit) return;
                const fd = new FormData();
                fd.set('submissionId', submissionToUnsubmit.id);
                submissionUnsubmitFetcher.submit(fd, {
                  method: 'POST',
                  action: '/api/domain/unsubmit-submission',
                });
              }}
            >
              {submissionUnsubmitFetcher.state !== 'idle' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unsubmitting...
                </>
              ) : (
                'Unsubmit'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archived submissions</DialogTitle>
            <DialogDescription>
              Hidden from your main list. Your teacher can still view and grade
              them. These are read-only — archiving is retired, so this list
              only shows submissions archived before that change.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {archivedSubmissions.map((s) => {
              const isGraded = s.releasedAt != null;
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Link
                    to={`/app/submissions/${s.id}`}
                    className="min-w-0 flex-1 basis-[min(100%,12rem)] font-medium hover:underline"
                    onClick={() => setArchiveDialogOpen(false)}
                  >
                    <span className="block truncate">
                      {s.title?.trim() || 'Untitled submission'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.submittedAt).toLocaleDateString()}
                    </span>
                  </Link>
                  <Badge
                    variant={isGraded ? 'success' : 'secondary'}
                    className="shrink-0 text-[10px]"
                  >
                    {isGraded ? 'Graded' : 'Submitted'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={auth.isLocked} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Session Expired</DialogTitle>
            <DialogDescription>
              Your session expired while editing. Editing is now paused to
              prevent data loss. Please log in again to continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              data-testid="session-expired-login"
              onClick={handleLoginRedirect}
              className="w-full sm:w-auto"
            >
              Log In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

