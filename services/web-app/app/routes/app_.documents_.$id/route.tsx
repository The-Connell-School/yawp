import { invariant } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  data as dataResponse,
} from 'react-router';
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
  Link,
} from 'react-router';
import { ArrowLeft, Loader2, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import useBreakpoint from '~/hooks/useBreakpoint';
import { useUser } from '~/hooks/useUser';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  isDocumentSubmissionEnabledForSchool,
  isAssignmentsEnabledForOrganization,
} from '~/utils/feature-flags.server';
import { Comments } from './comments';
import { CommentsSelectionProvider } from './comments/selection-context';
import { DocumentEditor } from './document-editor/document-editor';
import type { EditorBridge } from './document-editor/use-editor-sync';
import { Tutor } from './tutor/tutor';
import { DocumentHistory } from './document-history/document-history';
import { getDocumentStatusLabel } from '~/components/document-status-badge';
import {
  readLastNonDocumentRoute,
  sanitizeExitTarget,
} from '~/utils/document-exit';
import { formatDateOnly } from '~/utils/date-only';
import type { SyncStatus } from '~/utils/sync-service';

import { useAuthHeartbeat } from './hooks/use-auth-heartbeat';
import { useCommentsState } from './hooks/use-comments-state';
import { useTutorState } from './hooks/use-tutor-state';
import { useDocumentSubmit } from './hooks/use-document-submit';

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
      updatedAt: true,
      revision: true,
      title: true,
      html: true,
      text: true,
      class: {
        select: {
          schoolId: true,
          school: { select: { organizationId: true } },
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          tutorContext: true,
          dueDate: true,
        },
      },
      submissions: {
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          title: true,
          submittedAt: true,
          gradedAt: true,
          releasedAt: true,
        },
      },
      revisions: { orderBy: { createdAt: 'desc' } },
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
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

  const isViewingAsTeacher = profile.id !== doc.profile.id;

  const submissions = doc.submissions;

  if (shouldSaveVersion) {
    const latestRevision = doc.revisions[0];
    if (doc.html && doc.text && latestRevision?.html !== doc.html) {
      prisma.documentRevision
        .create({
          data: {
            documentId: doc.id,
            html: doc.html,
            text: doc.text,
            trigger: 'loader-save',
          },
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

  const [isDocumentSubmissionEnabled, assignmentsEnabled] = await Promise.all([
    isDocumentSubmissionEnabledForSchool(doc.class?.schoolId),
    isAssignmentsEnabledForOrganization(doc.class?.school?.organizationId),
  ]);

  const sortedComments = sortDocumentCommentsByMarkupOrder(
    doc.comments,
    doc.html
  );

  return dataResponse({
    doc: {
      ...doc,
      comments: sortedComments,
    },
    submissions,
    currentCms,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: doc.studentCourseModuleSessions[cmsIdx + 1] !== undefined,
    isDocumentSubmissionEnabled,
    assignmentsEnabled,
  });
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs) {
  // Revalidate when the module session index changes (navigating between modules).
  const currentCmsIdx = args.currentUrl.searchParams.get('cmsIdx');
  const nextCmsIdx = args.nextUrl.searchParams.get('cmsIdx');
  if (currentCmsIdx !== nextCmsIdx) return true;

  // Otherwise, never revalidate. The editor owns document state client-side.
  // Server state flows through explicit fetch() calls + local React state.
  return false;
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [submissionTitle, setSubmissionTitle] = useState('');
  const [showOldComments, setShowOldComments] = useState(false);
  const [localSubmissions, setLocalSubmissions] = useState<
    Array<{ id: string; title: string; submittedAt: string; gradedAt: string | null; releasedAt: string | null }>
  >([]);
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const cmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const explicitExitTarget = sanitizeExitTarget(searchParams.get('exitTo'));
  const tab = searchParams.get('tab') ?? 'tutor';
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;

  // Merge server + optimistic submissions
  const submissions = useMemo(() => {
    const serverSubs = data.submissions ?? [];
    const serverIds = new Set(serverSubs.map((s: any) => s.id));
    const newLocal = localSubmissions.filter((s) => !serverIds.has(s.id));
    return [...newLocal, ...serverSubs];
  }, [data.submissions, localSubmissions]);
  const latestSubmission = submissions[0] ?? null;
  const isSubmitted = submissions.length > 0;
  const gradedCount = submissions.filter((s: any) => s.releasedAt).length;
  const versionNumber = submissions.length + 1;
  const documentStatusLabel = getDocumentStatusLabel({
    submittedAt: latestSubmission?.submittedAt ?? null,
    grade: gradedCount > 0 ? { releasedAt: latestSubmission?.releasedAt } : null,
  });
  const isDocumentEditable = !isViewingAsTeacher;
  const editorServerHtml = data.doc.html ?? '';
  const editorServerText = data.doc.text ?? '';

  // Exit target is computed once on mount (session-storage read is idempotent)
  const [exitTarget] = useState<string>(
    () => explicitExitTarget ?? readLastNonDocumentRoute() ?? '/app'
  );

  // Editor bridge handle — stable ref populated by DocumentEditor.onBridgeReady
  const editorBridgeRef = useRef<EditorBridge | null>(null);

  // ── Extracted hooks ────────────────────────────────────────────────
  const auth = useAuthHeartbeat({
    documentId: data.doc.id,
    isEditable: isDocumentEditable,
  });
  const tutor = useTutorState(data.currentCms as any, cmsIdx);
  const commentsState = useCommentsState(
    (data.doc.comments as any[]) ?? []
  );
  const submit = useDocumentSubmit({
    documentId: data.doc.id,
    editorBridgeRef,
    onSubmitted: (newSubmission) => {
      setIsFinalizeDialogOpen(false);
      setSubmissionTitle('');
      setLocalSubmissions((prev) => [
        { ...newSubmission, gradedAt: null, releasedAt: null },
        ...prev,
      ]);
    },
  });

  const isEditorEditable =
    isDocumentEditable && !auth.isLocked && auth.isInitialCheckComplete;

  // ── Derived UI data ────────────────────────────────────────────────
  const allComments = commentsState.comments as any[];
  const activeComments = allComments.filter((c) => !c.archivedAt);
  const archivedComments = allComments.filter((c) => !!c.archivedAt);
  const visibleComments = isSubmitted
    ? showOldComments
      ? allComments
      : activeComments
    : activeComments;
  const teacherHeaderTitle = data.doc.title?.trim() || 'Untitled document';
  const studentName = data.doc.profile.user.name?.trim() || 'Unknown student';
  // Submit button is always enabled — the editor has content by the
  // time the user can click it. (Old polling logic deleted with Task 17.)
  const hasEditorContent = true;
  const isSubmitting = submit.isSubmitting;

  const tutorHasPreviousCms = useMemo(() => {
    const liveCmsId = tutor.cms?.id ?? data.currentCms.id;
    return (
      data.hasPreviousCms || liveCmsId !== data.currentCms.id
    );
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
          {!isViewingAsTeacher && submissions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Submissions ({submissions.length})
                  {gradedCount > 0 && (
                    <Badge variant="success" className="ml-1 text-[10px] px-1.5 py-0">
                      {gradedCount} graded
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="border-b px-3 py-2">
                  <p className="text-sm font-semibold">Submissions</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {submissions.map((s: any, i: number) => {
                    const version = submissions.length - i;
                    const isGraded = s.releasedAt != null;
                    return (
                      <Link
                        key={s.id}
                        to={`/app/submissions/${s.id}`}
                        className="flex items-center justify-between gap-2 border-b px-3 py-2.5 text-sm hover:bg-muted/50 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.title || `Version ${version}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(s.submittedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant={isGraded ? 'success' : 'secondary'}
                          className="shrink-0 text-[10px]"
                        >
                          {isGraded ? 'Graded' : 'Submitted'}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <div className="ml-auto flex items-center gap-4">
            {data.isDocumentSubmissionEnabled && !isViewingAsTeacher && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  data-testid="document-submit-button"
                  onClick={() => {
                    setSubmissionTitle(data.doc.title || '');
                    setIsFinalizeDialogOpen(true);
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
              </>
            )}
            {isSubmitted && archivedComments.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOldComments((v) => !v)}
              >
                {showOldComments ? 'Hide old comments' : 'Show old comments'}
              </Button>
            )}
            <DocumentHistory documentId={data.doc.id} syncStatus={syncStatus} />
          </div>
        </nav>
        {data.assignmentsEnabled && data.doc.assignment ? (
          <div className="mx-auto w-full max-w-screen-2xl border-b bg-amber-50 px-3 py-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info-outlined" size="sm">
                  Assignment Prompt
                </Badge>
                <span className="text-sm font-medium">
                  {data.doc.assignment.title?.trim() || 'Untitled Assignment'}
                </span>
                {data.doc.assignment.dueDate ? (
                  <span className="text-xs text-muted-foreground">
                    Due {formatDateOnly(data.doc.assignment.dueDate)}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">
                {data.doc.assignment.prompt}
              </p>
            </div>
          </div>
        ) : null}
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
          <div className="mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden">
            {isMobile && tab !== 'tutor' ? null : (
              <Tutor
                docId={data.doc.id}
                cms={(tutor.cms ?? data.currentCms) as any}
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
            {isMobile && tab !== 'editor' ? null : (
              <DocumentEditor
                docId={data.doc.id}
                serverHtml={editorServerHtml}
                serverText={editorServerText}
                serverUpdatedAt={data.doc.updatedAt}
                initialRevision={data.doc.revision}
                isEditable={isEditorEditable}
                onBridgeReady={(b) => {
                  editorBridgeRef.current = b;
                }}
                onSyncStatusChange={setSyncStatus}
                onCommentCreated={(c) =>
                  commentsState.addComment(c as any)
                }
              />
            )}
            {isMobile && tab !== 'comments' ? null : (
              <Comments
                comments={visibleComments as any}
                readOnly={!isDocumentEditable}
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
                Submit Version {versionNumber}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label htmlFor="submission-title" className="text-sm font-medium text-foreground">
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
                    <li>
                      You can keep editing and submit again after this.
                    </li>
                  </ul>
                  {submissions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Previous submissions
                      </p>
                      <div className="max-h-32 overflow-y-auto rounded-md border">
                        {submissions.map((s: any, i: number) => {
                          const version = submissions.length - i;
                          const isGraded = s.releasedAt != null;
                          return (
                            <a
                              key={s.id}
                              href={`/app/submissions/${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm hover:bg-muted/50 last:border-0"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-xs text-muted-foreground">v{version}</span>
                                <span className="truncate">{s.title || `Version ${version}`}</span>
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
              <Button
                variant="default"
                data-testid="document-finalize-submit"
                onClick={() => {
                  void submit.submitNow(submissionTitle || data.doc.title || '');
                }}
                disabled={isSubmitting}
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
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
