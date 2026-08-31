import { Outlet } from 'react-router';
import { AuthPageShell } from '~/components/auth-brand-lockup';

export default function AuthLayout() {
  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
