import { Button } from '~/components/ui/button';
import { setProfileId } from '~/cookies/profile-id.server';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { Form, Link, redirect, type LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Re-check profile existence in case a stale profile-id cookie caused a false no-profile redirect.
  const profile = await prisma.profile.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (profile) {
    throw redirect('/app', {
      headers: { 'set-cookie': await setProfileId(profile.id) },
    });
  }
}

export default function Route() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold">No Profile</h1>
      <p className="text-sm text-muted-foreground">
        You don't have a profile yet. Please contact your administrator.
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
