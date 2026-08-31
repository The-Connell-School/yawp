import { invariant } from '@epic-web/invariant';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
  useLoaderData,
  useNavigate,
} from 'react-router';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { resolveGrammarHighlightingEnabled } from '~/domain/assignment-types/rubric-category-options';
import {
  isRevisionSubmissionReady,
  resolveRevisionAccess,
  resolveRevisionDenialRedirect,
} from '~/domain/revisions/revision-flow';
import { CommentsSelectionProvider } from '~/routes/app_.documents_.$id/comments/selection-context';
import { DocumentEditor } from '~/routes/app_.documents_.$id/document-editor/document-editor';
import type { EditorBridge } from '~/routes/app_.documents_.$id/document-editor/use-editor-sync';
import { useAuthHeartbeat } from '~/routes/app_.documents_.$id/hooks/use-auth-heartbeat';
import { useDocumentSubmit } from '~/routes/app_.documents_.$id/hooks/use-document-submit';
import { EssayPanel } from '~/routes/app_.submissions_.$submissionId/essay-panel';
import { GradeHighlightsOverlay } from '~/routes/app_.submissions_.$submissionId/teacher-grading/grade-highlights-overlay';
import {
  resolveGrammarHighlightingForAssignmentType,
  resolveRubricConfigForSubmission,
} from '~/routes/app_.submissions_.$submissionId/submission-rubric-config.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import { redirectWithToast } from '~/utils/toast.server';
import type { SyncStatus } from '~/utils/sync-service';

import {
  resolveClickedFeedback,
  type FeedbackFocusRequest,
} from './feedback-focus';
import { RevisionFeedbackPanel } from './revision-feedback-panel';

/**
 * Student revision flow, V1.
 *
 * Left: the graded submission exactly as it was released — frozen HTML, the
 * teacher's inline comments, the grading assistant's marks, and the grade
 * itself in a collapsible panel. Right: the student's live document, with no
 * marks on it, so the feedback on the left can be worked into the draft on the
 * right.
 *
 * The revision tutor is deliberately absent; it lands in V2.
 */

export function shouldRevalidate({
  defaultShouldRevalidate,
  formMethod,
}: ShouldRevalidateFunctionArgs) {
  // The editor owns document state client-side, exactly as it does on the
  // document route. A revalidation mid-edit would hand the editor a stale
  // server snapshot.
  if (formMethod && formMethod !== 'GET') return defaultShouldRevalidate;
  return false;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  // This route mounts an editable student document. Staff access to the
  // submission/grading views must never imply access to this writing surface,
  // even when staff own a document themselves or have organization privileges.
  if (profile.role !== 'STUDENT' || profile.isActive !== true) {
    return redirectWithToast(`/app/submissions/${params.submissionId}`, {
      description:
        profile.isActive === true
          ? 'Only students can use the revision workspace.'
          : 'Your student membership must be active to revise this essay.',
      type: 'error',
    });
  }

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        is: {
          artifactKind: 'STUDENT',
          membershipId: profile.id,
          membership: { organizationId: profile.organization.id },
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
      rubricScores: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      grammarIssues: true,
      releasedAt: true,
      gradedAt: true,
      unsubmittedAt: true,
      documentId: true,
      document: {
        select: {
          id: true,
          title: true,
          html: true,
          text: true,
          revision: true,
          updatedAt: true,
          assignmentTypeId: true,
          assignment: {
            select: {
              id: true,
              title: true,
              prompt: true,
              promptAttachmentName: true,
              submitForGrade: true,
              pointValue: true,
            },
          },
          membership: {
            select: { id: true, userId: true, organizationId: true },
          },
        },
      },
      comments: {
        select: {
          id: true,
          content: true,
          excerpt: true,
          occurrence: true,
          createdAt: true,
          membership: {
            select: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      gradingAssistantRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          assignmentTypeRubricSnapshot: true,
          source: true,
          status: true,
          metadata: true,
        },
      },
    },
  });

  if (!submission || !submission.document.membership) {
    return redirectWithToast('/app', {
      description: 'Submission not found.',
      type: 'error',
    });
  }

  const access = resolveRevisionAccess({
    membershipRole: profile.role,
    isActiveMembership: profile.isActive,
    revisionFlowEnabled: profile.organization.revisionFlowEnabled === true,
    isOwner: submission.document.membership.userId === userId,
    isReleased: submission.releasedAt != null,
    isWithdrawn: submission.unsubmittedAt != null,
  });

  if (!access.allowed) {
    const denial = resolveRevisionDenialRedirect({
      reason: access.reason,
      submissionId: submission.id,
      documentId: submission.documentId,
    });
    return redirectWithToast(denial.path, {
      description: denial.description,
      type: denial.type,
    });
  }

  const [rubricConfig, grammarHighlightingEnabled] = await Promise.all([
    resolveRubricConfigForSubmission({
      assignmentTypeId: submission.document.assignmentTypeId,
      latestGradingRun: submission.gradingAssistantRuns[0] ?? null,
      rubricScores: submission.rubricScores,
    }),
    resolveGrammarHighlightingForAssignmentType(
      submission.document.assignmentTypeId
    ),
  ]);

  const { document, ...gradedSubmission } = submission;

  return {
    submission: {
      ...gradedSubmission,
      rubricConfig,
      grammarHighlightingEnabled,
      document: {
        assignment: document.assignment
          ? {
              submitForGrade: document.assignment.submitForGrade,
              pointValue: document.assignment.pointValue,
            }
          : null,
      },
    },
    document: {
      id: document.id,
      title: document.title,
      html: document.html ?? '',
      text: document.text ?? '',
      revision: document.revision,
      updatedAt: document.updatedAt,
      assignment: document.assignment,
    },
  };
}

/** Hover tints the mark through the overlay's own CSS; nothing else. */
const noopGrammarHover = () => {};

const PANE_HEADER_CLASS =
  'flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5';

/**
 * The assignment prompt, spanning both panes. Collapsible and collapsed-by-
 * default state is remembered per document, matching the editor's own banner
 * so a student who closed it there does not meet it reopened here.
 */
function RevisionAssignmentPrompt({
  assignment,
}: {
  assignment: { title: string | null; prompt: string | null } | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  if (!assignment?.prompt?.trim()) return null;

  return (
    <div
      className="shrink-0 border-b bg-amber-50"
      data-testid="revision-assignment-prompt"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="shrink-0 text-sm text-muted-foreground">
          Assignment prompt
        </span>
        <span className="min-w-0 truncate text-sm font-bold text-foreground/80">
          {assignment.title}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen ? (
        <p className="max-h-[20vh] overflow-y-auto px-4 pb-2 text-sm">
          {assignment.prompt}
        </p>
      ) : null}
    </div>
  );
}

export default function ReviseRoute() {
  const { submission, document } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [revisionTitle, setRevisionTitle] = useState(
    () => document.title || submission.title || ''
  );
  const editorBridgeRef = useRef<EditorBridge | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [gradedEssayElement, setGradedEssayElement] =
    useState<HTMLDivElement | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FeedbackFocusRequest | null>(
    null
  );
  const focusNonceRef = useRef(0);

  const requestFeedbackFocus = useCallback(
    (clicked: { kind: 'teacher' | 'assistant'; id: string } | null) => {
      if (!clicked) return;
      if (clicked.kind === 'teacher') setActiveCommentId(clicked.id);
      focusNonceRef.current += 1;
      setFocusRequest({ ...clicked, nonce: focusNonceRef.current });
    },
    []
  );

  const auth = useAuthHeartbeat({ documentId: document.id, isEditable: true });

  const handleEditorBridgeReady = useCallback((bridge: EditorBridge | null) => {
    editorBridgeRef.current = bridge;
    setEditorReady(bridge !== null);
  }, []);

  const submit = useDocumentSubmit({
    documentId: document.id,
    editorBridgeRef,
    requireEditorBridge: true,
    onSubmitted: (created) => {
      setIsConfirmOpen(false);
      navigate(`/app/submissions/${created.id}`);
    },
  });

  const [editorSubmittable, setEditorSubmittable] = useState(() =>
    isDocumentSubmittableContent(document.html, document.text)
  );
  const handleSubmittableContentChange = useCallback((next: boolean) => {
    setEditorSubmittable(next);
  }, []);

  const grammarHighlightingEnabled = useMemo(() => {
    if (typeof submission.grammarHighlightingEnabled === 'boolean') {
      return submission.grammarHighlightingEnabled;
    }
    return resolveGrammarHighlightingEnabled(
      submission.rubricConfig?.categories ?? []
    );
  }, [submission.grammarHighlightingEnabled, submission.rubricConfig]);

  const grammarIssues: GrammarIssue[] = useMemo(
    () =>
      grammarHighlightingEnabled
        ? parseGrammarIssuesPayload(submission.grammarIssues, {
            sourceText: submission.text ?? '',
          })
        : [],
    [grammarHighlightingEnabled, submission.grammarIssues, submission.text]
  );

  // The graded pane carries every mark the student was shown when the grade
  // was released. The draft pane deliberately carries none.
  const gradedHighlights = useMemo(
    () => [
      ...submission.comments.map((comment) => ({
        id: comment.id,
        excerpt: comment.excerpt,
        occurrence: comment.occurrence,
        dataAttr: 'data-grade-comment-id' as const,
        className: 'grade-comment-mark',
      })),
      ...grammarIssues.map((issue) => ({
        id: issue.id,
        excerpt: issue.excerpt,
        occurrence: issue.occurrence,
        dataAttr: 'data-grammar-issue-id' as const,
        className: 'grammar-issue-mark',
      })),
    ],
    [submission.comments, grammarIssues]
  );

  const handleCommentMarkClick = useCallback(
    (commentId: string) => {
      requestFeedbackFocus(
        resolveClickedFeedback({ commentId, grammarIssueIds: [] })
      );
    },
    [requestFeedbackFocus]
  );

  const handleGrammarMarkClick = useCallback(
    (grammarIssueIds: string[]) => {
      requestFeedbackFocus(
        resolveClickedFeedback({ commentId: null, grammarIssueIds })
      );
    },
    [requestFeedbackFocus]
  );

  const gradeSummaryLabel = useMemo(() => {
    if (submission.numericPercentage == null) return submission.score ?? null;
    return submission.letterGrade
      ? `${submission.numericPercentage}% (${submission.letterGrade})`
      : `${submission.numericPercentage}%`;
  }, [submission.numericPercentage, submission.letterGrade, submission.score]);

  const canSubmitRevision = isRevisionSubmissionReady({
    editorSubmittable,
    editorReady,
    isAuthCheckComplete: auth.isInitialCheckComplete,
    isLocked: auth.isLocked,
    isSubmitting: submit.isSubmitting,
    syncStatus,
  });

  return (
    <main className="flex h-screen flex-col bg-background">
      <nav className="flex w-full flex-wrap items-center gap-3 border-b bg-white px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/app/submissions/${submission.id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to grade
        </Button>

        <div className="h-4 w-px shrink-0 bg-border" />

        <p className="min-w-0 truncate text-sm font-semibold">
          {document.title || 'Untitled'}
        </p>
        <Badge variant="info-outlined" className="shrink-0">
          Revising
        </Badge>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SaveStatusIndicator status={syncStatus} />
          <Button
            size="sm"
            data-testid="revision-submit"
            disabled={!canSubmitRevision}
            onClick={() => setIsConfirmOpen(true)}
          >
            Submit revision
          </Button>
        </div>
      </nav>

      {/* The prompt belongs to both drafts, so it spans both panes rather than
          sitting inside the editor. That also removes the tallest reason the
          two columns started at different heights. */}
      <RevisionAssignmentPrompt assignment={document.assignment} />

      <div className="flex min-h-0 grow flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* ── Left: the graded essay, frozen, with its feedback ─────── */}
        <section
          data-testid="revision-graded-pane"
          className="flex min-h-[110vh] w-full min-w-0 flex-col overflow-hidden border-b bg-white md:h-full md:min-h-0 md:w-1/2 md:border-r md:border-b-0"
          aria-label="Graded essay and feedback"
        >
          <div className="flex min-h-0 grow flex-col overflow-hidden xl:flex-row">
            <RevisionFeedbackPanel
              submission={submission}
              comments={submission.comments}
              grammarIssues={grammarIssues}
              grammarHighlightingEnabled={grammarHighlightingEnabled}
              activeCommentId={activeCommentId}
              onSelectComment={setActiveCommentId}
              focusRequest={focusRequest}
            />
            <div className="flex min-h-[60vh] w-full min-w-0 grow flex-col overflow-hidden md:min-h-0 xl:w-auto">
              <div className={PANE_HEADER_CLASS}>
                <span className="text-sm font-semibold">Graded version</span>
                {gradeSummaryLabel ? (
                  <span className="text-xs text-muted-foreground">
                    {gradeSummaryLabel}
                  </span>
                ) : null}
              </div>
              <EssayPanel
                ref={setGradedEssayElement}
                html={submission.html ?? ''}
              />
              {gradedEssayElement ? (
                <GradeHighlightsOverlay
                  contentRoot={gradedEssayElement}
                  highlights={gradedHighlights}
                  activeGradeCommentId={activeCommentId}
                  // Clicking any mark opens the note behind it in the panel —
                  // the panel is also where V2's revision tutor will read from.
                  // Hover only tints the mark; it must not yank the panel open
                  // as the student reads across the essay.
                  onGradeCommentSelect={handleCommentMarkClick}
                  onGrammarIssueHover={noopGrammarHover}
                  onGrammarIssueSelect={handleGrammarMarkClick}
                />
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Right: the live draft, no marks ───────────────────────── */}
        <section
          data-testid="revision-draft-pane"
          // draft-comments-hidden neutralizes inline comment marks visually
          // without touching the stored HTML, so comment anchors survive.
          className="draft-comments-hidden flex min-h-[60vh] w-full min-w-0 grow flex-col overflow-hidden bg-white md:h-full md:min-h-0 md:w-1/2"
          aria-label="Your revision"
        >
          <div className={PANE_HEADER_CLASS}>
            <span className="text-sm font-semibold">Your revision</span>
            <span className="text-xs text-muted-foreground">
              Edits save automatically
            </span>
          </div>
          {/* The editor's selection toolbar reads this context. V1 shows no
              comment UI of its own, so the provider is only a host. */}
          <CommentsSelectionProvider>
            {/* DocumentEditor fills this route-owned frame, and its nested
                Editor fills the remaining mobile height below the toolbar. */}
            <div className="min-h-0 grow [&>div>div>div]:h-full [&>div]:h-full">
              <DocumentEditor
                docId={document.id}
                // Rendered once above both panes instead.
                assignment={null}
                serverHtml={document.html}
                serverText={document.text}
                serverUpdatedAt={document.updatedAt}
                initialRevision={document.revision}
                isEditable={!auth.isLocked && auth.isInitialCheckComplete}
                onBridgeReady={handleEditorBridgeReady}
                onSyncStatusChange={setSyncStatus}
                onSubmittableContentChange={handleSubmittableContentChange}
              />
            </div>
          </CommentsSelectionProvider>
        </section>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your revision</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p className="text-sm">
                  This turns your revised draft in as a new submission. The
                  graded version you are working from stays where it is.
                </p>
                <div className="space-y-2">
                  <label
                    htmlFor="revision-title"
                    className="text-sm font-medium text-foreground"
                  >
                    Submission title
                  </label>
                  <Input
                    id="revision-title"
                    data-testid="revision-title-input"
                    value={revisionTitle}
                    onChange={(event) => setRevisionTitle(event.target.value)}
                    placeholder="Enter a title for this revision"
                  />
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={submit.isSubmitting}
            >
              Keep revising
            </Button>
            <Button
              data-testid="revision-submit-confirm"
              disabled={!canSubmitRevision}
              onClick={() =>
                submit.submitNow(revisionTitle.trim() || undefined)
              }
            >
              {submit.isSubmitting ? 'Submitting…' : 'Submit revision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
