import { type LoaderFunctionArgs, redirect, Link } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

/** Provisioning creates the starter class; this route only nudges teachers to my-classes. */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  await requireMembership(request, userId);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!app) throw redirect('/app');
  throw redirect('/app/my-classes');
}

export default function FreeTierSetupRoute() {
  return (
    <main className="p-6 max-w-xl mx-auto space-y-4">
      <p className="text-muted-foreground">
        <Link to="/app/my-classes" className="underline">Continue to your classes</Link>
      </p>
    </main>
  );
}
