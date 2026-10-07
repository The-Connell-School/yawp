import { type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { status: true },
  });
  return { status: app?.status ?? null };
}

export default function FreeTierStatusRoute() {
  const { status } = useLoaderData<typeof loader>();
  const copy =
    status === 'REJECTED'
      ? 'This request was not approved. Contact support@yawp.school if you have questions.'
      : 'This invite expired. Contact support@yawp.school for a new link.';
  return (
    <main className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Free classroom request</h1>
      <p className="text-muted-foreground">{copy}</p>
    </main>
  );
}
