import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { ArrowLeft, Check, Loader2, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Comments } from './comments';
import { CommentsSelectionProvider } from './comments/selection-context';
import { Editor } from './editor';
import { Tutor } from './tutor';
import { DocumentVersions } from './_components/document-versions';
import { GradeDetailsSheet } from './grade-details-sheet';

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
          grades: {
            select: {
              id: true,
              score: true,
              feedback: true,
              overallScore: true,
              overallComment: true,
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

  return dataResponse({
    doc,
    currentCms,
    nextCmId,
    shouldSaveVersion,
    hasPreviousCms: doc.studentCourseModuleSessions[cmsIdx + 1] !== undefined,
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
  const [isGradeDetailsOpen, setIsGradeDetailsOpen] = useState(false);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [hasEditorContent, setHasEditorContent] = useState(
    !!(data.doc.html && data.doc.text)
  );
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'tutor';
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;
  const isSubmitting = submitFetcher.state !== 'idle';
  const isSubmitted = data.doc.submittedAt !== null;
  const grade = data.doc.submittedSnapshot?.grades?.[0];
  const isGradeReleased = grade?.releasedAt !== null && grade?.releasedAt !== undefined;

  const changeTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params);
  };

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
        toast.success(submitFetcher.data.message || 'Essay submitted successfully!');
        setIsFinalizeDialogOpen(false);
        // Reload the page to reflect the new submission status
        navigate(window.location.pathname + window.location.search, { replace: true });
      }
    }
  }, [submitFetcher.state, submitFetcher.data, navigate]);

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
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4" />
              Exit
            </Button>
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
          </div>
          {!isViewingAsTeacher && isSubmitted && (
            <div className="flex items-center gap-2">
              {isGradeReleased ? (
                <Badge variant="success" className="text-xs">
                  Graded {new Date(grade.releasedAt!).toLocaleDateString()}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Being graded {new Date(data.doc.submittedAt!).toLocaleDateString()}
                </Badge>
              )}
            </div>
          )}
          {isViewingAsTeacher ? (
            <div className="flex items-center gap-2">
              <Badge variant="info-outlined" className="md:text-md text-xs">
                {isMobile
                  ? data.doc.profile.user.name
                  : `Viewing work by ${data.doc.profile.user.name}`}
              </Badge>
              {isSubmitted && (
                <Badge variant="success" className="md:text-md text-xs">
                  Submitted {new Date(data.doc.submittedAt!).toLocaleDateString()}
                </Badge>
              )}
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-4">
            {!isViewingAsTeacher && !isSubmitted && (
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
                      Finalizing...
                    </>
                  ) : (
                    'Finalize'
                  )}
                </Button>
                <div className="h-[20px] border-r" />
              </>
            )}
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
          </div>
        </nav>
        {grade && ((!isViewingAsTeacher && isGradeReleased) || isViewingAsTeacher) && (
          <div className="mx-auto w-full max-w-screen-2xl border-b bg-green-50 dark:bg-green-950/20 px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={isGradeReleased ? 'success' : 'secondary'}>
                  {isGradeReleased ? 'Grade Released' : 'Graded (Not Released)'}
                </Badge>
                <span className="text-sm font-medium">
                  {grade.score || (grade.overallScore ? `${grade.overallScore}/5` : 'Graded')}
                </span>
              </div>
              {(grade.feedback || grade.overallComment) && (
                <div className="flex-1 sm:mx-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {grade.overallComment || grade.feedback}
                  </p>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsGradeDetailsOpen(true)}
                className="bg-white dark:bg-background"
              >
                View Details
              </Button>
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
          <div className="mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden">
            {isMobile && tab !== 'tutor' ? null : (
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
              />
            )}
            {isMobile && tab !== 'comments' ? null : (
              <Comments comments={data.doc.comments as any} />
            )}
          </div>
        </CommentsSelectionProvider>
      </main>
      {grade && (isGradeReleased || isViewingAsTeacher) && (
        <GradeDetailsSheet
          isOpen={isGradeDetailsOpen}
          onClose={() => setIsGradeDetailsOpen(false)}
          grade={grade}
        />
      )}
      <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Finalize Document
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                Before you finalize this document, please note the following:
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                <li>
                  Once finalized, any changes you make to this document will{' '}
                  <strong>not be reflected</strong> in the version sent for grading.
                </li>
                <li>
                  This action <strong>cannot be undone</strong>. You will not be able to
                  resubmit the document.
                </li>
                <li>
                  Your teacher will receive the current version of your document for
                  grading.
                </li>
              </ul>
              <p className="pt-2 font-medium">
                Are you sure you want to finalize this document?
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
    </>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
