import { type ActionFunctionArgs } from 'react-router';
import { logout } from '~/utils/auth.server.ts';

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  return logout({ request, redirectTo: '/auth/login' });
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
