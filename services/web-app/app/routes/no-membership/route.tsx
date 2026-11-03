import { AuthPageShell } from '~/components/auth-brand-lockup';
import { UnifiedLogin } from '~/components/unified-signon/unified-login';
import { signedInTeacherPromptEntry } from '~/domain/unified-signon/teacher-prompts.server';
import { Button } from '~/components/ui/button';
import { setMembershipId } from '~/cookies/membership-id.server';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import {
  Form,
  Link,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const prompt = await signedInTeacherPromptEntry(request, userId, 'inactive');
  if (prompt) return prompt;

  const membership = await prisma.orgMembership.findFirst({
    where: { userId, isActive: true },
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
  const result = useLoaderData<typeof loader>();
  if (result?.teacherPromptEntry)
    return (
      <AuthPageShell>
        <UnifiedLogin entry={result.teacherPromptEntry} />
      </AuthPageShell>
    );
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
