import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  Form,
  Link,
  redirect,
  useLoaderData,
} from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { CaretLeftIcon } from '~/components/icons';
import type { BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'Essay' };

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });

  const essay = await prisma.modelEssay.findUnique({
    where: { id },
    include: {
      assignmentType: { select: { id: true, title: true } },
      module: { select: { id: true, title: true } },
      createdBy: { select: { name: true, email: true } },
      hiddenBy: { select: { name: true, email: true } },
    },
  });

  if (!essay) throw new Response('Not Found', { status: 404 });

  return dataResponse({ essay });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });

  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'update-metadata') {
    const gradeLevelRaw = formData.get('gradeLevel');
    const gradeLevel =
      typeof gradeLevelRaw === 'string' && gradeLevelRaw.trim() !== ''
        ? Number.parseInt(gradeLevelRaw, 10)
        : null;

    await prisma.modelEssay.update({
      where: { id },
      data: {
        title: formData.get('title')?.toString() ?? undefined,
        subtitle: formData.get('subtitle')?.toString() || null,
        essayType: formData.get('essayType')?.toString() || null,
        part: formData.get('part')?.toString() || null,
        topicCategory: formData.get('topicCategory')?.toString() || null,
        gradeLevel: Number.isFinite(gradeLevel) ? gradeLevel : null,
        assignmentTypeId: formData.get('assignmentTypeId')?.toString() || null,
        moduleId: formData.get('moduleId')?.toString() || null,
      },
    });
    return dataResponse({ success: true });
  }

  if (intent === 'hide' || intent === 'unhide') {
    const isHidden = intent === 'hide';
    await prisma.modelEssay.update({
      where: { id },
      data: {
        isHidden,
        hiddenAt: isHidden ? new Date() : null,
        hiddenById: isHidden ? admin.id : null,
        hiddenReason: isHidden
          ? (formData.get('hiddenReason')?.toString() ?? null)
          : null,
      },
    });
    return dataResponse({ success: true });
  }

  if (intent === 'delete') {
    await prisma.modelEssay.delete({ where: { id } });
    return redirect('/app/admin/model-essays');
  }

  return dataResponse({ error: 'Unknown intent.' }, { status: 400 });
}

export default function AdminModelEssayDetail() {
  const { essay } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/admin/model-essays">
            <CaretLeftIcon />
            All model essays
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {essay.isHidden ? (
            <Badge variant="destructive">Hidden</Badge>
          ) : (
            <Badge variant="secondary">Published</Badge>
          )}
          {essay.essayType ? (
            <Badge variant="outline">{essay.essayType}</Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{essay.title}</h1>
        {essay.subtitle ? (
          <p className="text-muted-foreground italic">{essay.subtitle}</p>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="intent" value="update-metadata" />
            <Field label="Title">
              <Input name="title" defaultValue={essay.title} />
            </Field>
            <Field label="Subtitle">
              <Input name="subtitle" defaultValue={essay.subtitle ?? ''} />
            </Field>
            <Field label="Rhetorical move (essay type)">
              <Input name="essayType" defaultValue={essay.essayType ?? ''} />
            </Field>
            <Field label="Editorial part">
              <Input name="part" defaultValue={essay.part ?? ''} />
            </Field>
            <Field label="Topic category">
              <Input
                name="topicCategory"
                defaultValue={essay.topicCategory ?? ''}
              />
            </Field>
            <Field label="Grade level">
              <Input
                name="gradeLevel"
                type="number"
                min={1}
                max={12}
                defaultValue={essay.gradeLevel ?? ''}
              />
            </Field>
            <Field label="Assignment type id (optional)">
              <Input
                name="assignmentTypeId"
                defaultValue={essay.assignmentTypeId ?? ''}
                placeholder={essay.assignmentType?.title ?? 'None'}
              />
            </Field>
            <Field label="Module id (optional)">
              <Input
                name="moduleId"
                defaultValue={essay.moduleId ?? ''}
                placeholder={essay.module?.title ?? 'None'}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm">
                Save metadata
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {essay.isHidden ? 'Restore' : 'Hide'} this essay
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col sm:flex-row gap-2">
            <input
              type="hidden"
              name="intent"
              value={essay.isHidden ? 'unhide' : 'hide'}
            />
            {!essay.isHidden ? (
              <Input
                name="hiddenReason"
                placeholder="Internal note (not shown to students)"
                className="sm:max-w-sm"
              />
            ) : null}
            <Button type="submit" variant="secondary" size="sm">
              {essay.isHidden ? 'Restore to library' : 'Hide from library'}
            </Button>
          </Form>
          {essay.isHidden && essay.hiddenReason ? (
            <p className="text-xs text-muted-foreground mt-2">
              Reason: {essay.hiddenReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Essay body</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm font-serif leading-relaxed bg-muted/40 p-3 rounded">
            {essay.body}
          </pre>
        </CardContent>
      </Card>

      {essay.teachingNotes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Teaching notes (staff-only)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/40 p-3 rounded">
              {essay.teachingNotes}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
