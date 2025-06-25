import { type LoaderFunctionArgs, data, redirect, Form } from 'react-router';
import { useLoaderData } from 'react-router';
import { Building2, LogOutIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isOwner: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          accessExpiresAt: true,
        },
      },
    },
  });

  // Determine the reason for access denial
  let reason: 'NO_ORGANIZATION' | 'ACCESS_EXPIRED' = 'NO_ORGANIZATION';
  let message =
    "You don't have access. Contact your organization owner if you think this is a mistake.";

  if (!user.organizationId || !user.organization) {
    reason = 'NO_ORGANIZATION';
  } else if (
    user.organization.accessExpiresAt &&
    new Date() > user.organization.accessExpiresAt
  ) {
    reason = 'ACCESS_EXPIRED';
    message = user.isOwner
      ? 'Your access has expired.'
      : "You don't have access. Contact your organization owner if you think this is a mistake.";
  } else {
    return redirect('/app');
  }

  return data({
    user,
    reason,
    message,
    organizationName: user.organization?.name,
  });
}

export default function AccessDeniedRoute() {
  const { user, reason, message, organizationName } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-gray-600">Welcome, {user.name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {reason === 'ACCESS_EXPIRED'
                ? 'Access Expired'
                : 'No Organization Access'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-gray-700 mb-4">{message}</p>

              {reason === 'ACCESS_EXPIRED' && organizationName && (
                <p className="text-sm text-gray-500 mb-4">
                  Your organization "{organizationName}" access has expired.
                </p>
              )}

              {reason === 'NO_ORGANIZATION' && (
                <p className="text-sm text-gray-500 mb-4">
                  You are not currently associated with any organization.
                </p>
              )}
            </div>

            <div className="flex flex-col space-y-3">
              <Form method="post" action="/auth/logout">
                <Button type="submit" variant="outline" className="w-full">
                  <LogOutIcon className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </Form>
            </div>

            <div className="text-xs text-gray-500 text-center mt-4">
              If you believe this is an error, please contact your organization
              administrator.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
