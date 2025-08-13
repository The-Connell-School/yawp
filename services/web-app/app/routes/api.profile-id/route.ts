import { redirect, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { z } from 'zod';
import { parseFormData, validationError } from '@rvf/react-router';
import { setProfileId } from '~/cookies/profile-id.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === 'POST') {
    const { error, data } = await parseFormData(
      request,
      z.object({
        profileId: z.string(),
      })
    );
    if (error) return validationError(error);

    const userId = await requireUserId(request);

    const profile = await prisma.profile.findFirst({
      where: { id: data.profileId, userId },
      select: { id: true },
    });

    const redirectTo = request.headers.get('Referer') || '/app';
    if (!profile) return redirect(redirectTo);

    return redirect(redirectTo, {
      headers: { 'set-cookie': await setProfileId(profile.id) },
    });
  }
}
