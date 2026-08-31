import { Outlet } from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';

export default function AuthLayout() {
  return (
    <div className="min-h-screen py-8">
      <AuthBrandLockup />
      <Outlet />
    </div>
  );
}
