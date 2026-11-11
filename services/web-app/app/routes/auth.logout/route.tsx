import { type ActionFunctionArgs } from 'react-router';
import { signoutDestination } from '~/domain/unified-signon/teacher-prompts';
import { logout } from '~/utils/auth.server.ts';

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const requested = signoutDestination(
    new URL(request.url).searchParams.get('redirectTo')
  );
  const redirectTo = requested === '/free' ? requested : '/auth/login';
  return logout({
    request,
    redirectTo,
    ...(redirectTo === '/free' ? { awaitSessionDeletion: true } : {}),
  });
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
