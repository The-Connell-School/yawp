import { type ActionFunctionArgs, redirect } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { LoginSchema } from '~/components/login-form';
import {
  getSessionExpirationDate,
  requireAnonymous,
  sessionKey,
  verifyUserPassword,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { posthog } from '~/services/posthog.server';
import {
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
} from '~/utils/preview-access.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { combineHeaders } from '~/utils/misc';
import {
  getUaPartnerContext,
  isUaPartnerHost,
} from '~/utils/ua-partner.server';

type LoginSiteMismatch = 'main' | 'ua';

async function getLoginSiteMismatch(
  request: Request,
  userId: string
): Promise<LoginSiteMismatch | null> {
  const uaOrganizationId = process.env.UA_ORGANIZATION_ID?.trim();
  if (!uaOrganizationId) return null;

  const memberships = await prisma.orgMembership.findMany({
    where: { userId, isActive: true },
    select: { organizationId: true },
  });
  const hasUaMembership = memberships.some(
    ({ organizationId }) => organizationId === uaOrganizationId
  );
  const hasNonUaMembership = memberships.some(
    ({ organizationId }) => organizationId !== uaOrganizationId
  );

  if (isUaPartnerHost(request)) {
    if (!hasUaMembership && hasNonUaMembership) {
      const partnerContext = await getUaPartnerContext(request);
      return partnerContext ? null : 'main';
    }
    return null;
  }

  return hasUaMembership && !hasNonUaMembership ? 'ua' : null;
}

export async function loginAction({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const { error, data } = await parseFormData(request, LoginSchema);
  if (error) return validationError(error);

  try {
    const { email, password } = data;
    const user = await verifyUserPassword({ email }, password);

    if (!user) {
      return validationError(
        { fieldErrors: { email: 'Invalid email or password' } },
        data
      );
    }

    let previewMembershipId: string | null = null;
    const isolatedPreviewSeatMode = isIsolatedPreviewSeatMode();
    if (isolatedPreviewSeatMode) {
      const seat = await getPreviewAccessSeat(request);
      const seatMembership = seat
        ? await prisma.orgMembership.findFirst({
            where: {
              userId: user.id,
              organizationId: seat.organizationId,
              isActive: true,
            },
            select: { id: true },
          })
        : null;
      if (!seatMembership) {
        return validationError(
          { fieldErrors: { email: 'Invalid email or password' } },
          data
        );
      }
      previewMembershipId = seatMembership.id;
    }

    const siteMismatch = isolatedPreviewSeatMode
      ? null
      : await getLoginSiteMismatch(request, user.id);
    if (siteMismatch) {
      return validationError(
        { fieldErrors: { siteMismatch } },
        { email, password: '', redirectTo: data.redirectTo }
      );
    }

    const session = await prisma.session.create({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: getSessionExpirationDate(),
        userId: user.id,
      },
    });

    const cookies = request.headers.get('cookie');
    const authSession = await authSessionStorage.getSession(cookies);
    authSession.set(sessionKey, session.id);

    return redirect(safeRedirect(data.redirectTo, '/app'), {
      headers: combineHeaders(
        {
          'set-cookie': await authSessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
        },
        previewMembershipId
          ? { 'set-cookie': await setMembershipId(previewMembershipId) }
          : null
      ),
    });
  } catch (error) {
    posthog?.captureException(error, 'anonymous');
    return validationError(
      { fieldErrors: { email: 'Invalid email or password' } },
      data
    );
  }
}
