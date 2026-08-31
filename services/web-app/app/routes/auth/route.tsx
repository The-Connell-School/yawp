import { Outlet, data, type LoaderFunctionArgs } from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { isUaPartnerHost } from '~/utils/ua-partner.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const invitationPartner = invitation.get('partner');
  const queryPartner = new URL(request.url).searchParams.get('partner');
  return data({
    partner:
      isUaPartnerHost(request) ||
      invitationPartner === 'ua' ||
      queryPartner === 'ua'
        ? ('ua' as const)
        : null,
  });
}

export default function AuthLayout({
  loaderData,
}: {
  loaderData: { partner: 'ua' | null };
}) {
  return (
    <div className="min-h-screen py-8">
      <AuthBrandLockup partner={loaderData.partner} />
      <Outlet />
    </div>
  );
}
