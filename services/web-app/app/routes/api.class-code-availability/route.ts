import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { getClassCodeAvailability } from '~/utils/class-code-availability.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);

  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const excludeClassId = url.searchParams.get('excludeClassId')?.trim() || undefined;

  const availability = await getClassCodeAvailability(prisma, code, {
    excludeClassId,
  });

  return dataResponse(availability);
}
