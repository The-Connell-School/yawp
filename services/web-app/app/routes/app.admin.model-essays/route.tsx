import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  Form,
  Link,
  useLoaderData,
} from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import type { BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'Model essays' };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const essays = await prisma.modelEssay.findMany({
    orderBy: [{ part: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      essayType: true,
      part: true,
      topicCategory: true,
      gradeLevel: true,
      isHidden: true,
      updatedAt: true,
    },
  });

  return dataResponse({ essays });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const id = formData.get('id');

  if (typeof id !== 'string' || !id) {
    return dataResponse({ error: 'Essay id is required.' }, { status: 400 });
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

  return dataResponse({ error: 'Unknown intent.' }, { status: 400 });
}

export default function AdminModelEssaysRoute() {
  const { essays } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Model essays</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Staff-curated essays that appear in the YAWP! Library when the
          feature flag is enabled for an organization. Hidden essays are
          excluded from student-facing surfaces but kept on the table for
          audit. Bulk-load via{' '}
          <code>bun packages/prisma/scripts/seed-model-essays.ts</code>.
        </p>
      </header>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Rhetorical move</TableHead>
              <TableHead>Part</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {essays.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No model essays yet. Run the seed script to load the starter
                  collection.
                </TableCell>
              </TableRow>
            ) : (
              essays.map((essay) => (
                <TableRow key={essay.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={essay.id}
                      className="hover:underline underline-offset-4"
                    >
                      {essay.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {essay.essayType ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {essay.part ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {essay.topicCategory ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {essay.gradeLevel ?? '—'}
                  </TableCell>
                  <TableCell>
                    {essay.isHidden ? (
                      <Badge variant="destructive">Hidden</Badge>
                    ) : (
                      <Badge variant="secondary">Published</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Form method="post" className="inline">
                      <input type="hidden" name="id" value={essay.id} />
                      <input
                        type="hidden"
                        name="intent"
                        value={essay.isHidden ? 'unhide' : 'hide'}
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        {essay.isHidden ? 'Unhide' : 'Hide'}
                      </Button>
                    </Form>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
