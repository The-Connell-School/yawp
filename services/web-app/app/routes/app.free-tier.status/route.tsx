import { type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { FreeTierAuthCard, FreeTierSignOut } from '../free-tier/FreeTierAuthCard';

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
  const title = status === 'REJECTED' ? 'Request not approved' : 'Invite expired';
  const copy =
    status === 'REJECTED'
      ? 'This request was not approved. Contact support@yawp.school if you have questions.'
      : 'This invite expired. Contact support@yawp.school for a new link.';
  return (
    <FreeTierAuthCard title={title} className="yawp-entry-auth-shell-fit-auto">
      <p className="text-sm text-foreground/80">{copy}</p>
      <FreeTierSignOut />
    </FreeTierAuthCard>
  );
}
