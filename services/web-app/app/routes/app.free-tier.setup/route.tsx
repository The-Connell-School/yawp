import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect, useLoaderData } from 'react-router';
import { Form, Link } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { generateClassCode } from '~/utils/class';
import { getEntitlementsForPlan } from '~/utils/entitlements.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId, status: 'APPROVED' },
    select: { schoolName: true },
  });
  if (!app) throw redirect('/app');
  return { schoolName: app.schoolName, organizationId: profile.organization.id };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const title = String((await request.formData()).get('title') ?? 'My class').trim() || 'My class';
  const active = await prisma.class.count({
    where: { isArchived: false, teachers: { some: { id: profile.id } } },
  });
  const cap = getEntitlementsForPlan('FREE_CLASSROOM').activeClassCap ?? 1;
  if (active >= cap) throw redirect('/app/my-classes');
  const school = await prisma.school.findFirst({
    where: { organizationId: profile.organization.id },
    select: { id: true },
  });
  if (!school) throw redirect('/app');
  await prisma.class.create({
    data: {
      title,
      code: generateClassCode(),
      schoolId: school.id,
      teachers: { connect: [{ id: profile.id }] },
    },
  });
  throw redirect('/app/my-classes');
}

export default function FreeTierSetupRoute() {
  const { schoolName } = useLoaderData<typeof loader>();
  return (
    <main className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Create your first class</h1>
      <p className="text-muted-foreground">
        Free classroom includes one active class. Start with a Class Starter assignment after you create the class.
      </p>
      <Form method="post" className="space-y-3">
        <label className="block text-sm">
          Class name
          <input name="title" defaultValue={`${schoolName} — Period 1`} className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <button type="submit" className="yawp-entry-button yawp-entry-button-primary">Create class</button>
      </Form>
      <p className="text-sm">
        <Link to="/info" className="underline">How YAWP works</Link>
      </p>
    </main>
  );
}
