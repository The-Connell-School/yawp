import { type ActionFunctionArgs } from 'react-router';
import { logout } from '~/utils/auth.server.ts';
import { destroyUaPartnerContext } from '~/utils/ua-partner.server';

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  return logout(
    { request, redirectTo: '/auth/login' },
    { headers: { 'set-cookie': await destroyUaPartnerContext(request) } }
  );
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
