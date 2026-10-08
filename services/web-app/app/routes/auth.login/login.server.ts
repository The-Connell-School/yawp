import { type ActionFunctionArgs, redirect } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { LoginSchema } from '~/components/login-form';
import {
  getSessionExpirationDateForUser,
  requireAnonymous,
  sessionKey,
  verifyUserPassword,
} from '~/utils/auth.server';
import {
  rateLimitedFormResponse,
  recordFailedLoginIpRateLimit,
  recordFailedLoginIpSprayRateLimit,
  recordFailedLoginTargetRateLimit,
} from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { parseLoginIdentifier } from '~/utils/login-identifier.server';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { posthog } from '~/services/posthog.server';
import {
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
} from '~/utils/preview-access.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { combineHeaders } from '~/utils/misc';

export async function loginAction({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const { error, data } = await parseFormData(request, LoginSchema);
  if (error) return validationError(error);

  try {
    const { email: loginIdentifier, password } = data;
    const parsed = parseLoginIdentifier(loginIdentifier);

    const user = await verifyUserPassword({ login: loginIdentifier }, password);

    if (!user) {
      const cfg = RATE_LIMITS.unauth.login;
      const failSpray = await recordFailedLoginIpSprayRateLimit({
        request,
        route: '/auth/login',
        perIpSprayPerHour: cfg.perIpFailedSprayPerHour,
      });
      const failTarget = await recordFailedLoginTargetRateLimit({
        route: '/auth/login',
        targetKey: parsed.value,
        perTargetPerHour: cfg.perEmailPerHour,
      });
      const failIp = await recordFailedLoginIpRateLimit({
        request,
        route: '/auth/login',
        perIpPerMinute: cfg.perIpPerMinute,
        perIpPerHour: cfg.perIpPerHour,
      });
      if (!failSpray.allowed) {
        return rateLimitedFormResponse(
          'email',
          failSpray.retryAfterSeconds,
          'Too many login attempts. Please wait and try again.'
        );
      }
      if (!failTarget.allowed) {
        return rateLimitedFormResponse(
          'email',
          failTarget.retryAfterSeconds,
          'Too many login attempts. Please wait and try again.'
        );
      }
      if (!failIp.allowed) {
        return rateLimitedFormResponse(
          'email',
          failIp.retryAfterSeconds,
          'Too many login attempts. Please wait and try again.'
        );
      }
      return validationError(
        { fieldErrors: { email: 'Invalid email or password' } },
        data
      );
    }

    let previewMembershipId: string | null = null;
    if (isIsolatedPreviewSeatMode()) {
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

    const session = await prisma.session.create({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: getSessionExpirationDateForUser({
          email: user.email,
        }),
        userId: user.id,
      },
    });

    const cookies = request.headers.get('cookie');
    const authSession = await authSessionStorage.getSession(cookies);
    authSession.set(sessionKey, session.id);

    const destination = user.mustChangePassword
      ? '/auth/required-password-change'
      : safeRedirect(data.redirectTo, '/app');

    return redirect(destination, {
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
