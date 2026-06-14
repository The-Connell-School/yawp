import { Button } from '~/components/ui/button';
import { setMembershipId } from '~/cookies/membership-id.server';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { Form, Link, redirect, type LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const membership = await prisma.orgMembership.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (membership) {
    throw redirect('/app', {
      headers: { 'set-cookie': await setMembershipId(membership.id) },
    });
  }
}

export default function Route() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold">No Membership</h1>
      <p className="text-sm text-muted-foreground">
        You don't have an organization membership yet. Please contact your
        administrator.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button asChild>
          <Link to="/app">Retry</Link>
        </Button>
        <Form method="post" action="/auth/logout">
          <Button variant="outline" type="submit">
            Log out
          </Button>
        </Form>
      </div>
    </div>
  );
}
