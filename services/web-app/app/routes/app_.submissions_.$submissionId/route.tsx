import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { useLoaderData, Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  SubmissionCommentCard,
} from '~/components/submission-comment-card';
import { requireUserId, requireProfile } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import { findExcerptRange } from '~/utils/excerpt-position';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.submissionId, 'No submission id found');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const submission = await prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      // Only the document owner or a teacher of that student's class can view
      document: {
        OR: [
          { profile: { id: profile.id } },
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
      releasedAt: true,
      gradedAt: true,
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

  // Students can only see their own released submissions
  const isOwner = submission.document.profile.id === profile.id;
  if (isOwner && !submission.releasedAt) {
    return redirectWithToast(`/app/documents/${submission.documentId}`, {
      description: 'Grade has not been released yet.',
      type: 'error',
    });
  }

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

  return {
    submission: {
      ...submission,
      comments: sortedComments,
    },
    isOwner,
  };
}

export default function SubmissionRoute() {
  const { submission, isOwner } = useLoaderData<typeof loader>();

  const gradeDisplay =
    formatGrade(
      submission.numericPercentage ?? null,
      submission.letterGrade ?? null
    ) ||
    submission.score ||
    (submission.overallScore ? `${submission.overallScore}/5` : null);

  const rubricScores = submission.rubricScores as Record<
    string,
    { score?: number; comment?: string }
  > | null;

  const revisePath = `/app/documents/${submission.documentId}?revise=1`;

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <nav className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 border-b px-3 py-2">
        <Button variant="secondary" size="sm" asChild>
          <Link to="/app">
            <ArrowLeft className="h-4" />
            Back
          </Link>
        </Button>
        <p className="text-sm font-semibold">
          {submission.title || submission.document.title || 'Untitled'}
        </p>
        {gradeDisplay ? (
          <Badge
            variant="secondary"
            className="border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
          >
            {gradeDisplay}
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {isOwner ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={revisePath}>Revise Essay</Link>
            </Button>
          ) : null}
        </div>
      </nav>

      {/* Grade summary banner */}
      {gradeDisplay || submission.overallComment || submission.feedback ? (
        <div className="mx-auto w-full max-w-screen-2xl border-b bg-green-50 px-3 py-3 dark:bg-green-950/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="success">Grade Released</Badge>
              {gradeDisplay ? (
                <span className="text-sm font-medium">{gradeDisplay}</span>
              ) : null}
            </div>
            {(submission.overallComment || submission.feedback) && (
              <div className="flex-1 sm:mx-4">
                <p className="text-sm text-muted-foreground">
                  {submission.overallComment || submission.feedback}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden">
        {/* Essay content */}
        <div className="flex-1 overflow-y-auto border-r">
          <div className="mx-auto max-w-3xl p-6">
            {submission.html ? (
              <div
                className="prose prose-sm max-w-none font-times"
                dangerouslySetInnerHTML={{ __html: submission.html }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm">
                {submission.text}
              </p>
            )}
          </div>
        </div>

        {/* Comments sidebar */}
        <div className="hidden w-80 flex-col overflow-y-auto md:flex">
          <div className="border-b p-3">
            <h2 className="text-sm font-semibold">Feedback Comments</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {submission.comments.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                No comments yet.
              </p>
            ) : (
              <div className="space-y-3">
                {submission.comments.map((comment) => (
                  <SubmissionCommentCard
                    key={comment.id}
                    comment={comment}
                    readOnly
                  />
                ))}
              </div>
            )}
          </div>

          {/* Rubric scores */}
          {rubricScores && Object.keys(rubricScores).length > 0 ? (
            <div className="border-t p-3">
              <h3 className="mb-2 text-sm font-semibold">Rubric</h3>
              <div className="space-y-2">
                {Object.entries(rubricScores).map(([key, value]) => {
                  if (!value || typeof value !== 'object') return null;
                  const label = key
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  return (
                    <div key={key} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">
                          {value.score ? `${value.score}/5` : '—'}
                        </span>
                      </div>
                      {value.comment ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {value.comment}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
