import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { signoutDestination } from '~/domain/unified-signon/teacher-prompts';
import { logout } from '~/utils/auth.server.ts';

async function endSession({ request }: LoaderFunctionArgs | ActionFunctionArgs) {
  const requested = signoutDestination(
    new URL(request.url).searchParams.get('redirectTo')
  );
  const redirectTo = requested === '/free' ? requested : '/auth/login';
  return logout({
    request,
    redirectTo,
    ...(redirectTo === '/free' ? { awaitSessionDeletion: true } : {}),
  });
}

/** Bookmarked or linked GET /auth/logout (e.g. Stop impersonating) must sign out, not 400. */
export async function loader(args: LoaderFunctionArgs) {
  return endSession(args);
}

export async function action(args: ActionFunctionArgs) {
  return endSession(args);
}
