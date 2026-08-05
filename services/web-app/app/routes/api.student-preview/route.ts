import { redirect, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import {
  canEnterStudentPreview,
  endStudentPreview,
  startStudentPreview,
} from '~/utils/student-preview.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

const PreviewIntentSchema = z.object({
  intent: z.enum(['start', 'end']),
  redirectTo: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const formData = await request.formData();
  const { error, data } = await parseFormData(formData, PreviewIntentSchema);
  if (error) return validationError(error);

  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const redirectTo =
    (typeof data.redirectTo === 'string' && data.redirectTo.startsWith('/')
      ? data.redirectTo
      : null) ||
    request.headers.get('Referer') ||
    '/app';

  if (data.intent === 'end') {
    return redirect(redirectTo, {
      headers: { 'set-cookie': await endStudentPreview(request) },
    });
  }

  if (
    !canEnterStudentPreview({
      role: membership.role,
      isAdmin: hasEffectivePlatformAdmin(user.isAdmin),
    })
  ) {
    return Response.json(
      { error: 'Student preview not allowed' },
      { status: 403 }
    );
  }

  return redirect(redirectTo, {
    headers: {
      'set-cookie': await startStudentPreview(
        request,
        membership.organization.id
      ),
    },
  });
}
