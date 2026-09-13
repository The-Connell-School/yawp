import type { ActionFunctionArgs } from 'react-router';
import { impersonationHttp } from '~/utils/internal-impersonation-runtime.server';

export const action = ({ request }: ActionFunctionArgs) => impersonationHttp().end(request);
