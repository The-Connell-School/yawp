import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from 'react-router';
import {
  data,
  Form,
  redirect,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import {
  destroyPendingLtiLink,
  getPendingLtiLink,
} from '~/cookies/lti-pending-link.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import {
  cancelPendingLtiLink,
  inspectPendingLtiLink,
  linkPendingLtiIdentity,
} from '~/domain/lms/lti-pilot.server';
import { requireUserId } from '~/utils/auth.server';

function pendingLinkError(headers?: Headers) {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set('cache-control', 'no-store');
  return redirect('/lti/error?code=link_expired', {
    status: 303,
    headers: responseHeaders,
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const pending = await getPendingLtiLink(request);
  if (!pending) return pendingLinkError();
  await requireUserId(request);
  try {
    const details = await inspectPendingLtiLink({
      pendingLinkId: pending.id,
      secret: pending.secret,
    });
    return data(details, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    const headers = new Headers();
    headers.append('set-cookie', await destroyPendingLtiLink());
    return pendingLinkError(headers);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const pending = await getPendingLtiLink(request);
  if (!pending) return pendingLinkError();
  const userId = await requireUserId(request);
  try {
    const formData = await request.formData();
    if (formData.get('intent') === 'cancel-link') {
      await cancelPendingLtiLink({
        pendingLinkId: pending.id,
        secret: pending.secret,
        actorUserId: userId,
      });
      const headers = new Headers({ 'cache-control': 'no-store' });
      headers.append('set-cookie', await destroyPendingLtiLink());
      return redirect('/app', { status: 303, headers });
    }
    if (formData.get('intent') !== 'confirm-link') {
      return pendingLinkError();
    }
    const linked = await linkPendingLtiIdentity({
      pendingLinkId: pending.id,
      secret: pending.secret,
      userId,
    });
    const headers = new Headers({ 'cache-control': 'no-store' });
    headers.append('set-cookie', await destroyPendingLtiLink());
    headers.append('set-cookie', await setMembershipId(linked.membershipId));
    return redirect(linked.destination, { status: 303, headers });
  } catch {
    const headers = new Headers();
    headers.append('set-cookie', await destroyPendingLtiLink());
    return pendingLinkError(headers);
  }
}

export const meta: MetaFunction = () => [{ title: 'Connect your LMS | Yawp' }];

export default function LtiLinkRoute() {
  const details = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-12 sm:py-20">
      <Card className="mx-auto max-w-lg shadow-sm">
        <CardHeader className="space-y-3">
          <Badge variant="secondary" className="w-fit">
            Secure LMS connection
          </Badge>
          <CardTitle className="text-2xl">Connect this LMS identity?</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Confirm that this launch should use your signed-in Yawp account. We
            do not match accounts by LMS email.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="divide-y rounded-lg border bg-background">
            <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-muted-foreground">
                Organization
              </dt>
              <dd className="text-sm font-medium">
                {details.organizationName}
              </dd>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-muted-foreground">
                Course
              </dt>
              <dd className="text-sm font-medium">{details.className}</dd>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-muted-foreground">
                Role
              </dt>
              <dd className="text-sm font-medium">
                {details.role === 'TEACHER' ? 'Teacher' : 'Student'}
              </dd>
            </div>
          </dl>
          <Form method="post">
            <Button
              type="submit"
              name="intent"
              value="confirm-link"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Connecting…' : 'Connect and open course'}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="cancel-link"
              variant="outline"
              className="mt-2 w-full"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </Form>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            Only this LMS registration and Yawp membership are linked. No
            password or LMS profile details are stored.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
