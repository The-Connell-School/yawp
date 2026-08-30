import { Outlet, data, type LoaderFunctionArgs } from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { getUaPartnerContext } from '~/utils/ua-partner.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const context = await getUaPartnerContext(request);
  return data({ partner: context?.partner ?? null });
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
