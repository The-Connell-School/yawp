import type { LoaderFunctionArgs } from 'react-router';
import { data } from 'react-router';
import { getLocalDevLoginOptionsPage } from '~/routes/auth.dev-login/dev-login.server';
import { prisma } from '~/utils/db.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';

export async function devLoginPageLoader({ request }: LoaderFunctionArgs) {
  if (!isLocalDevAuthEnabled()) {
    throw new Response('Dev login is disabled.', { status: 403 });
  }

  const gateEnabled = isPreviewDevLoginAccessCodeRequired();
  const previewSeat = gateEnabled ? await getPreviewAccessSeat(request) : null;
  if (gateEnabled && !previewSeat) {
    throw new Response(null, {
      status: 302,
      headers: { Location: '/auth/preview-access?returnTo=/auth/dev-login' },
    });
  }

  const page = await getLocalDevLoginOptionsPage(
    previewSeat?.organizationId,
    prisma,
    { cursor: 0 }
  );

  return data({ options: page.options });
}
