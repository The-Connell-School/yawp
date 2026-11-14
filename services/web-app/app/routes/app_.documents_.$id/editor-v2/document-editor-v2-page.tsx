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
import { DocumentEditor } from './document-editor/document-editor';
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
import {
  isApHistorySnapshot,
  type ApHistorySnapshot,
} from '~/domain/ap-history/schema';
import { ApHistoryAssignmentPanel } from './ap-history-assignment-panel';
import { DbqLayout } from './_components/dbq-layout';
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
  getRenderableApHistorySnapshot,
  isTutorEnabledForAssignment,
  shouldRenderDbqWorkspace,
} from '../route';
import './document-editor/document-editor-redesign.css';

const SUBMIT_EMPTY_TOOLTIP =
  "You can't submit an empty document. Add text first.";

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
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
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
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
    const parts = [
      cls.title?.trim(),
      cls.period?.trim() ? `Period ${cls.period.trim()}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [data.doc.classAssignment?.class]);
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackCmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const cmsIdx =
    typeof data.currentCmsIdx === 'number' && data.currentCmsIdx >= 0
      ? data.currentCmsIdx
      : fallbackCmsIdx;
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tutorEnabled = isTutorEnabledForAssignment(data.doc.assignment);
  const tab = searchParams.get('tab') ?? (tutorEnabled ? 'tutor' : 'editor');
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
  const showSubmitControls = !isViewingAsTeacher || isOwnTeacherPreview;
  const isDocumentOwner = user.id === data.doc.membership.userId;
  // Students and teachers in "Try it" preview edit; grading teachers view-only.
  const isDocumentEditable =
    isDocumentOwner || isOwnTeacherPreview;
  const assignment = data.doc.assignment;
  // A student practice document carries its own snapshot; a teacher-assigned
  // document inherits it from the assignment.
  const apHistorySnapshot = getRenderableApHistorySnapshot({
    apHistorySnapshot:
      data.doc.apHistorySnapshot ?? assignment?.apHistorySnapshot,
  });
  const showDbqWorkspace = shouldRenderDbqWorkspace(apHistorySnapshot);
  const editorAssignmentPrompt = getGenericAssignmentPromptForEditor(
    assignment,
    apHistorySnapshot
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
  const editorServerHtml = data.doc.html ?? '';
  const editorServerText = data.doc.text ?? '';

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
      setIsFinalizeDialogOpen(false);
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
    isDocumentEditable && !auth.isLocked && auth.isInitialCheckComplete;
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
  const apHistoryTimingLabel = apHistorySnapshot
    ? apHistorySnapshot.timing.mode === 'timed'
      ? `Timed · ${apHistorySnapshot.timing.durationMinutes}m`
      : 'Untimed'
    : null;
  const apHistoryContextLabel = apHistorySnapshot
    ? `${apHistorySnapshot.essayType.toUpperCase()} · ${apHistorySnapshot.course.toUpperCase()}`
    : null;
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
        {apHistorySnapshot && !showDbqWorkspace ? (
          <ApHistoryAssignmentPanel snapshot={apHistorySnapshot} />
        ) : null}
        {isViewingAsTeacher && !isOwnTeacherPreview ? (
          <p
            className="doc-editor-view-banner"
            data-testid="document-view-only-banner"
          >
            Viewing only. Select text to comment.
          </p>
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
              {classSubtitle ? (
                <span className="truncate text-xs text-[hsl(50_2.4%_36%)]">
                  {classSubtitle}
                </span>
              ) : apHistoryContextLabel ? (
                <span
                  data-testid="ap-history-context-pill"
                  className="truncate text-xs text-[hsl(50_2.4%_36%)]"
                >
                  {apHistoryContextLabel}
                </span>
              ) : null}
            </div>
          </div>
          {hasAnySubmissionRecord && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Submissions ({submissionCountForBadge})
                  {gradedCount > 0 && (
                    <Badge
                      variant="success"
                      className="ml-1 text-[10px] px-1.5 py-0"
                    >
                      {gradedCount} graded
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <p className="text-sm font-semibold">Submissions</p>
                  {!isViewingAsTeacher && archivedSubmissions.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="View archived submissions"
                      onClick={() => setArchiveDialogOpen(true)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {studentList.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
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
                      const isWithdrawn = s.unsubmittedAt != null;
                      const isGraded = !isWithdrawn && s.releasedAt != null;
                      return (
                        <div
                          key={s.id}
                          className="flex items-stretch gap-1 border-b last:border-0"
                        >
                          <Link
                            to={`/app/submissions/${s.id}`}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{label}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(s.submittedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {isArchived ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  Archived
                                </Badge>
                              ) : null}
                              {isWithdrawn ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  Withdrawn
                                </Badge>
                              ) : (
                                <Badge
                                  variant={isGraded ? 'success' : 'secondary'}
                                  className="text-[10px]"
                                >
                                  {isGraded ? 'Graded' : 'Submitted'}
                                </Badge>
                              )}
                            </div>
                          </Link>
                          {!isViewingAsTeacher && !isArchived ? (
                            <div className="flex items-center gap-1 pr-2">
                              {data.canSelfUnsubmit ? (
                                s.gradedAt != null || s.releasedAt != null ? (
                                  <Tooltip
                                    text={STUDENT_UNSUBMIT_BLOCKED_TOOLTIP}
                                    delayDuration={0}
                                  >
                                    <span
                                      className="inline-flex"
                                      data-testid={`student-unsubmit-disabled-reason-${s.id}`}
                                    >
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground"
                                        aria-label="Cannot unsubmit graded submission"
                                        data-testid={`student-unsubmit-${s.id}`}
                                        disabled
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </Button>
                                    </span>
                                  </Tooltip>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground"
                                    aria-label="Unsubmit submission"
                                    data-testid={`student-unsubmit-${s.id}`}
                                    disabled={
                                      submissionUnsubmitFetcher.state !== 'idle'
                                    }
                                    onClick={() => setSubmissionToUnsubmit(s)}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                )
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
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
            {apHistoryTimingLabel ? (
              <div
                data-testid="ap-history-timing-pill"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>{apHistoryTimingLabel}</span>
              </div>
            ) : null}
            {!isMobile && !showDbqWorkspace ? (
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
            {showSubmitControls && (
              <>
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
                    onClick={() => {
                      setSubmissionTitle(getLiveDocumentTitle());
                      setIsFinalizeDialogOpen(true);
                    }}
                  >
                    Submit
                  </Button>
                )}
              </>
            )}
            {hasAnySubmissionRecord && archivedComments.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOldComments((v) => !v)}
              >
                {showOldComments ? 'Hide old comments' : 'Show old comments'}
              </Button>
            )}
            <div className="flex items-center gap-1.5" data-tour="doc-status">
              <SaveStatusIndicator status={syncStatus} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    aria-label="Document actions"
                    data-testid="document-actions-menu"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
            </div>
            <DocumentHistory
              documentId={data.doc.id}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          </div>
        </header>
        {showDbqWorkspace && apHistorySnapshot ? (
          <>
            <AssignmentPromptStrip
              label={`${apHistorySnapshot.essayType.toUpperCase()} · ${apHistorySnapshot.course.toUpperCase()}`}
              title={assignment?.title?.trim() || 'AP History Essay'}
              prompt={apHistorySnapshot.prompt}
              metadata={[
                `Period ${apHistorySnapshot.periodNumber}`,
                titleCase(apHistorySnapshot.reasoningSkill),
                `${apHistorySnapshot.sources.length} ${
                  apHistorySnapshot.sources.length === 1 ? 'source' : 'sources'
                }`,
              ]}
            />
            <CommentsSelectionProvider>
              <DbqLayout
                snapshot={apHistorySnapshot}
                tutor={
                  tutorEnabled ? (
                    <Tutor
                      className="h-full border-r-0 md:w-full"
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
                    />
                  ) : (
                    <AssignmentPromptPanel assignment={editorAssignmentPrompt} />
                  )
                }
                editor={
                  <DocumentEditor
                    docId={data.doc.id}
                    assignment={editorAssignmentPrompt}
                    serverHtml={editorServerHtml}
                    serverText={editorServerText}
                    serverUpdatedAt={data.doc.updatedAt}
                    initialRevision={data.doc.revision}
                    isEditable={isEditorEditable}
                    canUploadImages={data.canUploadImages}
                    onBridgeReady={handleEditorBridgeReady}
                    onSyncStatusChange={setSyncStatus}
                    onSubmittableContentChange={handleSubmittableContentChange}
                    onCommentCreated={(c) => commentsState.addComment(c as any)}
                  />
                }
                comments={
                  <TeacherPasteReport
                    key={data.doc.id}
                    enabled={isViewingAsTeacher}
                    documentId={data.doc.id}
                    contentRoot={editorRoot}
                    onSelectEvent={() => {
                      if (isMobile) changeTab('editor');
                    }}
                  >
                    <Comments
                      className="md:w-full"
                      showCollapsibleHeader={!isViewingAsTeacher}
                      comments={visibleComments as any}
                      readOnly={commentsReadOnly}
                      onCommentRemoved={commentsState.removeComment}
                      onResponseAdded={commentsState.addResponse}
                      autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
                    />
                  </TeacherPasteReport>
                }
              />
            </CommentsSelectionProvider>
          </>
        ) : (
          <>
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
                <DocumentEditor
                  docId={data.doc.id}
                  assignment={tutorEnabled ? editorAssignmentPrompt : null}
                  serverHtml={editorServerHtml}
                  serverText={editorServerText}
                  serverUpdatedAt={data.doc.updatedAt}
                  initialRevision={data.doc.revision}
                  isEditable={isEditorEditable}
                  canUploadImages={data.canUploadImages}
                  onBridgeReady={handleEditorBridgeReady}
                  onSyncStatusChange={setSyncStatus}
                  onSubmittableContentChange={handleSubmittableContentChange}
                  onCommentCreated={(c) => commentsState.addComment(c as any)}
                  marginComments={
                    !isMobile && desktopCommentsOpen ? (
                      <TeacherPasteReport
                        key={data.doc.id}
                        enabled={isViewingAsTeacher}
                        documentId={data.doc.id}
                        contentRoot={editorRoot}
                        onSelectEvent={() => {
                          if (isMobile) changeTab('editor');
                        }}
                      >
                        <MarginCommentsRail
                          comments={visibleComments as any}
                          readOnly={commentsReadOnly}
                          onCommentRemoved={commentsState.removeComment}
                          onResponseAdded={commentsState.addResponse}
                          autoFocusReplyCommentId={
                            commentsState.pendingFocusCommentId
                          }
                        />
                      </TeacherPasteReport>
                    ) : null
                  }
                />
              </div>
            )}
            {isMobile && tab !== 'comments' && !isViewingAsTeacher ? null : (
              <div
                className={cn(
                  isMobile && tab !== 'comments' ? 'hidden' : 'h-full min-w-0 w-full',
                  !isMobile && 'hidden'
                )}
              >
                <TeacherPasteReport
                  key={`${data.doc.id}-mobile-comments`}
                  enabled={isViewingAsTeacher}
                  documentId={data.doc.id}
                  contentRoot={editorRoot}
                  onSelectEvent={() => {
                    if (isMobile) changeTab('editor');
                  }}
                >
                  <Comments
                    showCollapsibleHeader={!isViewingAsTeacher}
                    comments={visibleComments as any}
                    readOnly={commentsReadOnly}
                    onCommentRemoved={commentsState.removeComment}
                    onResponseAdded={commentsState.addResponse}
                    autoFocusReplyCommentId={commentsState.pendingFocusCommentId}
                  />
                </TeacherPasteReport>
              </div>
            )}
          </div>
        </CommentsSelectionProvider>
        {isMobile && !showDbqWorkspace ? (
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
                aria-selected={tab === 'tutor'}
                onClick={() => changeTab('tutor')}
              >
                Tutor
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'editor'}
              onClick={() => changeTab('editor')}
            >
              Editor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'comments'}
              onClick={() => changeTab('comments')}
            >
              Comments
              {visibleComments.length > 0 ? ` (${visibleComments.length})` : ''}
            </button>
          </nav>
        ) : null}
          </>
        )}
      </main>
      <Dialog
        open={isFinalizeDialogOpen}
        onOpenChange={setIsFinalizeDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Submit Version {versionNumber}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label
                    htmlFor="submission-title"
                    className="text-sm font-medium text-foreground"
                  >
                    Submission Title
                  </label>
                  <Input
                    id="submission-title"
                    value={submissionTitle}
                    onChange={(e) => setSubmissionTitle(e.target.value)}
                    placeholder="Enter a title for this submission"
                  />
                </div>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  <li>
                    Submitting creates a snapshot of your essay for your teacher
                    to grade.
                  </li>
                  <li>You can keep editing and submit again after this.</li>
                </ul>
                {activeSubmissions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Previous submissions
                    </p>
                    <div className="max-h-32 overflow-y-auto rounded-md border">
                      {activeSubmissions.map((s) => {
                        const v = versionLabelForActiveSubmission(
                          activeSubmissions,
                          s.id
                        );
                        const isGraded = s.releasedAt != null;
                        const label = displaySubmissionTitle(
                          s.title,
                          v,
                          'Untitled submission'
                        );
                        return (
                          <a
                            key={s.id}
                            href={`/app/submissions/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm hover:bg-muted/50 last:border-0"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate">{label}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </div>
                            <Badge
                              variant={isGraded ? 'success' : 'secondary'}
                              className="shrink-0 text-[10px]"
                            >
                              {isGraded ? 'Graded' : 'Submitted'}
                            </Badge>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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
            {cannotSubmitEmpty && !isSubmitting ? (
              <Tooltip text={SUBMIT_EMPTY_TOOLTIP} delayDuration={0}>
                <span
                  className="inline-flex"
                  data-testid="document-finalize-submit-empty-trigger"
                >
                  <Button
                    variant="default"
                    data-testid="document-finalize-submit"
                    disabled
                  >
                    {`Submit Version ${versionNumber}`}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                variant="default"
                data-testid="document-finalize-submit"
                onClick={() => {
                  const resolved =
                    submissionTitle.trim() || getLiveDocumentTitle().trim();
                  void submit.submitNow(resolved);
                }}
                disabled={submitActionDisabled}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  `Submit Version ${versionNumber}`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

