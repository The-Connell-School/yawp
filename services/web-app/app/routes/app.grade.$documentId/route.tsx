import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useLoaderData, useFetcher, Link, Form } from 'react-router';
import { parseFormData, validationError, useForm } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { CaretLeftIcon } from '~/components/icons';
import { Textarea } from '~/components/ui/textarea';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { calculateWeightedGrade, percentageToLetterGrade } from '~/utils/gradeCalculation';
import { redirectWithToast } from '~/utils/toast.server';
import { useState, useEffect } from 'react';

const UpdateGradeSchema = z.object({
  gradeId: z.string(),
  percentageGrade: z.string().transform((val) => parseFloat(val)),
  overallComment: z.string().min(1, 'Overall comment is required'),
  isReleased: z.enum(['on']).optional(),
  scores: z.string().transform((val) => JSON.parse(val)),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const documentId = params.documentId!;
  const url = new URL(request.url);
  const exitTo = url.searchParams.get('exitTo') || '/app/my-classes';

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      submittedAt: { not: null },
      deletedAt: null,
    },
    include: {
      submittedSnapshot: true,
      profile: {
        include: {
          user: true,
        },
      },
      grade: {
        include: {
          rubricScores: {
            include: {
              dimension: true,
            },
            orderBy: {
              dimension: {
                position: 'asc',
              },
            },
          },
        },
      },
    },
  });

  if (!document || !document.submittedSnapshot) {
    throw new Response('Document not found or not submitted', { status: 404 });
  }

  const dimensions = await prisma.rubricDimension.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
  });

  return dataResponse({
    document,
    dimensions,
    exitTo,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    return dataResponse({ error: 'Teacher profile required' }, { status: 403 });
  }

  const { error, data } = await parseFormData(request, UpdateGradeSchema);
  if (error) return validationError(error);

  const letterGrade = percentageToLetterGrade(data.percentageGrade);

  // Update grade
  await prisma.documentGrade.update({
    where: { id: data.gradeId },
    data: {
      percentageGrade: data.percentageGrade,
      letterGrade,
      overallComment: data.overallComment,
      isReleased: data.isReleased === 'on',
      rubricScores: {
        updateMany: data.scores.map((s: { id: string; score: number; feedback: string }) => ({
          where: { id: s.id },
          data: {
            score: s.score,
            feedback: s.feedback,
          },
        })),
      },
    },
  });

  return redirectWithToast('/app/my-classes', {
    description: 'Grade updated successfully',
    type: 'success',
  });
}

export default function GradeDocumentRoute() {
  const data = useLoaderData<typeof loader>();
  const generateGradeFetcher = useFetcher();
  const [localScores, setLocalScores] = useState(
    data.document.grade?.rubricScores.map((s) => ({
      id: s.id,
      dimensionId: s.dimension.id,
      dimensionName: s.dimension.name,
      weight: s.dimension.weight,
      score: s.score,
      feedback: s.feedback || '',
    })) || []
  );
  const [percentageGrade, setPercentageGrade] = useState(
    data.document.grade?.percentageGrade || 0
  );
  const [overallComment, setOverallComment] = useState(
    data.document.grade?.overallComment || ''
  );

  const isGenerating = generateGradeFetcher.state !== 'idle';
  const studentName = data.document.profile.user.name || data.document.profile.user.email;

  // Recalculate grade from current scores
  const handleRecalculate = () => {
    if (localScores.length === 0) return;
    const calculated = calculateWeightedGrade(
      localScores.map((s) => ({ score: s.score, weight: s.weight }))
    );
    setPercentageGrade(Math.round(calculated * 100) / 100);
  };

  // Handle AI generation response
  useEffect(() => {
    if (
      generateGradeFetcher.data?.success &&
      generateGradeFetcher.state === 'idle'
    ) {
      const aiGrade = generateGradeFetcher.data.grade;
      if (aiGrade) {
        setLocalScores(aiGrade.rubricScores);
        setPercentageGrade(aiGrade.percentageGrade);
        setOverallComment(aiGrade.overallComment);
      }
    }
  }, [generateGradeFetcher.data, generateGradeFetcher.state]);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Grade Essay</h2>
            <p className="mt-1 text-muted-foreground">
              {studentName} - {data.document.title}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="mb-4">
          <Button asChild variant="outline">
            <Link to={data.exitTo} className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Essay Content */}
          <Card>
            <CardHeader>
              <CardTitle>Essay</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                dangerouslySetInnerHTML={{
                  __html: data.document.submittedSnapshot?.html || '',
                }}
                className="prose prose-sm max-w-none"
              />
            </CardContent>
          </Card>

          {/* Grading Panel */}
          <div className="space-y-4">
            {/* Generate AI Suggestions */}
            {!data.document.grade && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Grading Assistant</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate AI-powered rubric scores and feedback to get started.
                  </p>
                  <generateGradeFetcher.Form
                    method="POST"
                    action="/api/domain/generate-grade"
                  >
                    <input type="hidden" name="documentId" value={data.document.id} />
                    <Button type="submit" disabled={isGenerating} className="w-full">
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Generate AI Suggestions'
                      )}
                    </Button>
                  </generateGradeFetcher.Form>
                </CardContent>
              </Card>
            )}

            {/* Grading Form */}
            {(data.document.grade || localScores.length > 0) && (
              <Form method="POST">
                <input
                  type="hidden"
                  name="gradeId"
                  value={data.document.grade?.id}
                />
                <input
                  type="hidden"
                  name="scores"
                  value={JSON.stringify(localScores)}
                />

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Overall Grade</CardTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRecalculate}
                      >
                        Recalculate
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="percentageGrade">Percentage Grade</Label>
                        <Input
                          id="percentageGrade"
                          name="percentageGrade"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={percentageGrade}
                          onChange={(e) =>
                            setPercentageGrade(parseFloat(e.target.value))
                          }
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          Letter Grade: {percentageToLetterGrade(percentageGrade)}
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="overallComment">Overall Comment</Label>
                        <Textarea
                          id="overallComment"
                          name="overallComment"
                          value={overallComment}
                          onChange={(e) => setOverallComment(e.target.value)}
                          rows={4}
                          placeholder="Address the student by first name and provide constructive feedback..."
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isReleased"
                          name="isReleased"
                          defaultChecked={data.document.grade?.isReleased}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="isReleased" className="cursor-pointer">
                          Release grade to student
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Rubric Scores */}
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Rubric Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {localScores.map((rubricScore) => (
                        <div
                          key={rubricScore.id}
                          className="border-b pb-4 last:border-b-0"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h4 className="font-medium">
                                {rubricScore.dimensionName}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Weight: {Math.round(rubricScore.weight * 100)}%
                              </p>
                            </div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((score) => (
                                <Button
                                  key={score}
                                  type="button"
                                  variant={
                                    rubricScore.score === score
                                      ? 'default'
                                      : 'outline'
                                  }
                                  size="sm"
                                  onClick={() => {
                                    setLocalScores((prev) =>
                                      prev.map((s) =>
                                        s.id === rubricScore.id
                                          ? { ...s, score }
                                          : s
                                      )
                                    );
                                  }}
                                >
                                  {score}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <Textarea
                            value={rubricScore.feedback}
                            onChange={(e) => {
                              setLocalScores((prev) =>
                                prev.map((s) =>
                                  s.id === rubricScore.id
                                    ? { ...s, feedback: e.target.value }
                                    : s
                                )
                              );
                            }}
                            rows={2}
                            placeholder="Feedback for this dimension..."
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="mt-4 flex gap-2">
                  <Button type="submit" className="flex-1">
                    Save Grade
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to={data.exitTo}>Cancel</Link>
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
