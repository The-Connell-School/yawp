import type { ActionFunctionArgs } from 'react-router';
import { handoffPage, impersonationHttp } from '~/utils/internal-impersonation-runtime.server';

export const loader = () => handoffPage();
export const action = ({ request }: ActionFunctionArgs) => {
  if (process.env.INTERNAL_IMPERSONATION_ENABLED !== 'true') throw new Response('Not found', { status: 404 });
  return impersonationHttp().start(request);
};
