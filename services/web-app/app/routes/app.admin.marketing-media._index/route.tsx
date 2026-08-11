import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import {
  Form,
  Link,
  data as dataResponse,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { JobStatusBadge } from '~/components/marketing/job-status-badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { requireAdmin, requireMutableRequest } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { deleteSmallObject } from '~/services/s3.server';
import {
  getMarketingMediaDir,
  getMarketingRenderTarget,
  requireMarketingStudioEnabled,
} from '~/utils/marketing-studio.server';
import {
  StoryboardGenerationError,
  generateStoryboard,
} from '~/services/marketing-storyboard.server';
import {
  MARKETING_JOB_KINDS,
  MARKETING_LIBRARY,
  describeStoryboardError,
  safeParseStoryboard,
  type MarketingJobKind,
  type MarketingOutput,
} from '../../../../../packages/marketing-media';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'Marketing Studio' };

/**
 * Remove the files a render produced, wherever this environment keeps them.
 *
 * Best effort on purpose. A bucket that has already lost an object, or a
 * preview whose disk was reclaimed, must not strand a row in a list the
 * operator is trying to clear: orphaned media costs storage, an undeletable
 * job is a broken screen. The row goes either way.
 */
async function removeStoredMedia(rawOutputs: unknown): Promise<void> {
  const outputs = (
    Array.isArray(rawOutputs) ? rawOutputs : []
  ) as MarketingOutput[];
  if (outputs.length === 0) return;

  const mediaDir = getMarketingMediaDir();

  for (const output of outputs) {
    try {
      if (mediaDir) {
        fs.rmSync(path.join(mediaDir, output.key), { force: true });
      } else {
        await deleteSmallObject(output.key);
      }
    } catch {
      // Deliberately swallowed; see the note above.
    }
  }
}

const CreateJobSchema = z.object({
  brief: z
    .string()
    .trim()
    .min(10, 'Describe what the media should show.')
    .max(2000),
  audience: z.string().trim().max(200).optional(),
  kind: z.enum(MARKETING_JOB_KINDS),
  assignmentTypeId: z.string().trim().optional(),
  storyboardJson: z.string().trim().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  requireMarketingStudioEnabled();
  await requireAdmin(request);

  const [jobs, assignmentTypes] = await Promise.all([
    prisma.marketingMediaJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        kind: true,
        status: true,
        brief: true,
        audience: true,
        storyboard: true,
        outputs: true,
        error: true,
        createdBy: { select: { email: true, name: true } },
      },
    }),
    prisma.assignmentType.findMany({
      where: { archivedAt: null },
      orderBy: { title: 'asc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);

  return dataResponse({
    renderTarget: getMarketingRenderTarget(),
    assignmentTypes,
    library: MARKETING_LIBRARY.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
    })),
    jobs: jobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
      title: (job.storyboard as { title?: string } | null)?.title ?? null,
      outputCount: Array.isArray(job.outputs) ? job.outputs.length : 0,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  requireMarketingStudioEnabled();
  const admin = await requireAdmin(request);
  await requireMutableRequest(request);

  const formData = await request.formData();

  if (formData.get('intent') === 'delete') {
    const jobId = String(formData.get('jobId') ?? '');
    const job = await prisma.marketingMediaJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, outputs: true },
    });

    if (!job) {
      return dataResponse(
        { error: 'That render no longer exists.' },
        { status: 404 }
      );
    }

    // The renderer claims a job for the length of a take. Deleting the row out
    // from under it strands the worker mid-film and orphans whatever it
    // uploads next, so this waits rather than racing it.
    if (job.status === 'RENDERING') {
      return dataResponse(
        {
          error:
            'That render is being filmed right now. Wait for it to finish, then delete it.',
        },
        { status: 409 }
      );
    }

    await removeStoredMedia(job.outputs);
    // Revisions written from this job survive: the relation is onDelete
    // SetNull, so deleting a take never takes its follow-ups with it.
    await prisma.marketingMediaJob.delete({ where: { id: job.id } });
    return redirect('/app/admin/marketing-media');
  }

  // The library path: a hand-verified storyboard rendered as-is, with no
  // model in the loop. This is the reliable one-click route to media.
  if (formData.get('intent') === 'render-library') {
    const slug = String(formData.get('librarySlug') ?? '');
    const entry = MARKETING_LIBRARY.find((item) => item.slug === slug);
    if (!entry) {
      return dataResponse(
        { error: 'That library entry does not exist.' },
        { status: 400 }
      );
    }
    const job = await prisma.marketingMediaJob.create({
      data: {
        createdById: admin.id,
        kind: entry.kind,
        status: 'QUEUED',
        brief: entry.description,
        audience: null,
        subjectType: 'FEATURE',
        subjectId: null,
        subjectLabel: entry.title,
        storyboard: entry.storyboard as object,
        model: null,
        targetUrl: getMarketingRenderTarget(),
      },
      select: { id: true },
    });
    return redirect(`/app/admin/marketing-media/${job.id}`);
  }

  const parsed = CreateJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return dataResponse(
      { error: parsed.error.issues.map((issue) => issue.message).join('; ') },
      { status: 400 }
    );
  }

  const { brief, audience, kind, assignmentTypeId, storyboardJson } =
    parsed.data;
  const renderTarget = getMarketingRenderTarget();

  const subject = assignmentTypeId
    ? await prisma.assignmentType.findUnique({
        where: { id: assignmentTypeId },
        select: { id: true, title: true },
      })
    : null;

  // The pasted-storyboard path exists so an admin can correct what the model
  // wrote and re-run it without another generation, and so this surface can be
  // exercised without an LLM.
  if (storyboardJson) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(storyboardJson);
    } catch (err) {
      return dataResponse(
        {
          error: `Storyboard JSON is not valid JSON: ${(err as Error).message}`,
        },
        { status: 400 }
      );
    }

    const result = safeParseStoryboard(candidate);
    if (!result.success) {
      return dataResponse(
        { error: describeStoryboardError(result.error) },
        { status: 400 }
      );
    }

    const job = await prisma.marketingMediaJob.create({
      data: {
        createdById: admin.id,
        kind,
        status: 'QUEUED',
        brief,
        audience: audience || null,
        subjectType: subject ? 'ASSIGNMENT_TYPE' : 'FEATURE',
        subjectId: subject?.id ?? null,
        subjectLabel: subject?.title ?? null,
        storyboard: result.data,
        model: null,
        targetUrl: renderTarget,
      },
      select: { id: true },
    });

    return redirect(`/app/admin/marketing-media/${job.id}`);
  }

  const job = await prisma.marketingMediaJob.create({
    data: {
      createdById: admin.id,
      kind,
      status: 'GENERATING',
      brief,
      audience: audience || null,
      subjectType: subject ? 'ASSIGNMENT_TYPE' : 'FEATURE',
      subjectId: subject?.id ?? null,
      subjectLabel: subject?.title ?? null,
      targetUrl: renderTarget,
    },
    select: { id: true },
  });

  try {
    const generated = await generateStoryboard({
      brief,
      audience,
      kind: kind as MarketingJobKind,
      subject: subject
        ? { type: 'ASSIGNMENT_TYPE', label: subject.title }
        : null,
    });

    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        status: 'QUEUED',
        storyboard: generated.storyboard,
        model: generated.model,
      },
    });
  } catch (err) {
    // The job row survives a generation failure on purpose: the admin needs to
    // see why the brief did not become a storyboard.
    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error:
          err instanceof StoryboardGenerationError
            ? err.message
            : `Storyboard generation failed: ${err instanceof Error ? err.message : String(err)}`,
        finishedAt: new Date(),
      },
    });
  }

  return redirect(`/app/admin/marketing-media/${job.id}`);
}

/**
 * Open / Delete for one row of the render list.
 *
 * The delete posts through its own fetcher rather than the page form so a
 * refusal ("that one is being filmed right now") lands next to the row it is
 * about, instead of surfacing as an error on the New render card far above.
 */
function JobRowActions({ jobId, title }: { jobId: string; title: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  const deleting = fetcher.state !== 'idle';
  const error = fetcher.data?.error;

  return (
    <>
      <div className="flex items-center justify-end gap-3">
        <Link
          className="text-sm underline"
          to={`/app/admin/marketing-media/${jobId}`}
        >
          Open
        </Link>
        <ConfirmationDialog
          title="Delete this render?"
          description={`“${title}” and any files it produced will be removed. This cannot be undone.`}
          confirmText="Delete"
          cancelText="Keep"
          variant="destructive"
          onConfirm={() =>
            fetcher.submit({ intent: 'delete', jobId }, { method: 'post' })
          }
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            data-testid="marketing-job-delete"
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </ConfirmationDialog>
      </div>
      {error ? (
        <p
          data-testid="marketing-job-delete-error"
          className="mt-1 text-right text-xs text-red-600"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

export default function Route() {
  const { jobs, assignmentTypes, renderTarget, library } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showStoryboard, setShowStoryboard] = useState(false);
  const busy = navigation.state === 'submitting';

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Marketing Studio</h1>
        <p className="text-sm text-muted-foreground">
          Describe a feature or a course. YAWP! films it against the demo
          environment and hands back stills or a short silent clip.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Rendering against <code>{renderTarget}</code>. Demo data only — never
          point this at an environment holding real student work.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New render</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="brief">What should this show?</Label>
              <Textarea
                id="brief"
                name="brief"
                rows={3}
                required
                placeholder="A teacher opening a class, reading a submitted essay, and leaving rubric feedback."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audience">Audience</Label>
                <Input
                  id="audience"
                  name="audience"
                  placeholder="Department chairs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kind">Deliverable</Label>
                <select
                  id="kind"
                  name="kind"
                  defaultValue="STILLS"
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="STILLS">Screenshots</option>
                  <option value="CLIP">Feature clip (5–15s, silent)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assignmentTypeId">Course (optional)</Label>
                <select
                  id="assignmentTypeId"
                  name="assignmentTypeId"
                  defaultValue=""
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">No specific course</option>
                  {assignmentTypes.map((assignmentType) => (
                    <option key={assignmentType.id} value={assignmentType.id}>
                      {assignmentType.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowStoryboard((value) => !value)}
              >
                {showStoryboard
                  ? 'Hide storyboard JSON'
                  : 'Advanced: paste a storyboard'}
              </Button>
              {showStoryboard ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <Label htmlFor="storyboardJson">Storyboard JSON</Label>
                  <Textarea
                    id="storyboardJson"
                    name="storyboardJson"
                    rows={8}
                    className="font-mono text-xs"
                    placeholder='{"slug":"teacher-loop","title":"...","scenes":[...]}'
                  />
                  <p className="text-xs text-muted-foreground">
                    Skips generation and renders this storyboard as written.
                  </p>
                </div>
              ) : null}
            </div>

            {actionData?.error ? (
              <p
                data-testid="marketing-form-error"
                className="text-sm text-red-600"
              >
                {actionData.error}
              </p>
            ) : null}

            <div>
              <Button type="submit" disabled={busy}>
                {busy ? 'Working…' : 'Queue render'}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Hand-verified storyboards of the moments schools ask about —
            frequent low-stakes writing, criterion-referenced feedback, the
            grading pipeline, built-in teacher development. One click renders
            fresh media; no AI writing step, so these come out right every
            time.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {library.map((entry) => (
              <div
                key={entry.slug}
                data-testid="marketing-library-entry"
                className="flex flex-col justify-between gap-2 rounded border p-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.title}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {entry.kind === 'CLIP' ? 'Clip' : 'Stills'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.description}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="render-library" />
                  <input type="hidden" name="librarySlug" value={entry.slug} />
                  <Button type="submit" size="sm" variant="outline" disabled={busy}>
                    Render
                  </Button>
                </Form>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent renders</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing rendered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-md">
                      <div className="font-medium">
                        {job.title ?? 'Untitled'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {job.brief}
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.kind === 'CLIP' ? 'Clip' : 'Stills'}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell>{job.outputCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(job.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <JobRowActions
                        jobId={job.id}
                        title={job.title ?? 'Untitled'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
