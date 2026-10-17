import { type ActionFunctionArgs } from 'react-router';
import { signoutDestination } from '~/domain/unified-signon/teacher-prompts';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { SIGNON_TEACHER_PROMPTS_FLAG } from '~/domain/feature-flags/feature-flags';
import { logout } from '~/utils/auth.server.ts';

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const requested = signoutDestination(
    new URL(request.url).searchParams.get('redirectTo')
  );
  const redirectTo =
    requested === '/free' &&
    (await isFeatureFlagEnabled(SIGNON_TEACHER_PROMPTS_FLAG))
      ? requested
      : '/auth/login';
  return logout({
    request,
    redirectTo,
    ...(redirectTo === '/free' ? { awaitSessionDeletion: true } : {}),
  });
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
