import { type ActionFunctionArgs } from 'react-router';
import { logout } from '~/utils/auth.server.ts';

export async function action({ request }: ActionFunctionArgs) {
  return logout({ request, redirectTo: '/auth/login' });
}
