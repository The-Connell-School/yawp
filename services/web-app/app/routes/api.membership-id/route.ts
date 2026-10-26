import { redirect, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { z } from 'zod';
import { parseFormData, validationError } from '@rvf/react-router';
import { setMembershipId } from '~/cookies/membership-id.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === 'POST') {
    const { error, data } = await parseFormData(
      request,
      z.object({
        membershipId: z.string(),
      })
    );
    if (error) return validationError(error);

    const userId = await requireUserId(request);

    const membership = await prisma.orgMembership.findFirst({
      where: { id: data.membershipId, userId, isActive: true },
      select: { id: true },
    });

    if (!membership) return redirect('/app');

    return redirect('/app', {
      headers: { 'set-cookie': await setMembershipId(membership.id) },
    });
  }
}
