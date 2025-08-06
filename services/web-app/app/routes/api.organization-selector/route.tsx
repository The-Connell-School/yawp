import { type ActionFunctionArgs, redirect, data } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { createOrganizationCookie } from '~/utils/organization.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const formData = await request.formData();
  const organizationId = formData.get('organizationId');

  if (typeof organizationId !== 'string') {
    return data({ error: 'Organization ID is required' }, { status: 400 });
  }

  // Verify user has access to this organization
  const userRole = await prisma.userRole.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });

  if (!userRole) {
    return data({ error: 'Access denied to this organization' }, { status: 403 });
  }

  // Set the organization cookie and redirect
  const headers = new Headers();
  headers.set('Set-Cookie', createOrganizationCookie(organizationId));

  return redirect('/app', { headers });
}